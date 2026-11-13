import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  courses,
  notificationOutbox,
  OutboxStatus,
  purchases,
  refunds,
  users,
  UserRole,
} from "~/db/schema";

// ─── Notifications ───
// The one module that owns every Notification type. Callers pass a fact about
// something that happened; notify() decides who hears about it and writes one
// outbox row per recipient. A worker (drainOutbox) hands the rows to a
// transport later. See docs/adr/0013 and 0014, and GLOSSARY.md.
//
// notify() only writes to the database, so call it inside the same
// transaction as the domain change: if that rolls back, so do the rows.

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Queryable = Db | Tx;

export type NotificationType = "refund_requested" | "refund_awaiting_review";

/** What happened. `actorUserId` is the person who did it. */
export type NotificationEvent = {
  type: "refund_requested";
  refundRequestId: number;
  actorUserId: number;
};

export function notify(db: Queryable, event: NotificationEvent, now = new Date()) {
  const deliveries = resolveDeliveries(db, event);
  for (const delivery of deliveries) {
    db.insert(notificationOutbox)
      .values({
        type: delivery.type,
        recipientUserId: delivery.recipientUserId,
        payload: JSON.stringify(delivery.payload),
        status: OutboxStatus.Pending,
        nextAttemptAt: now.toISOString(),
        createdAt: now.toISOString(),
      })
      .run();
  }
}

type Delivery = {
  type: NotificationType;
  recipientUserId: number;
  payload: Record<string, unknown>;
};

function resolveDeliveries(db: Queryable, event: NotificationEvent): Delivery[] {
  switch (event.type) {
    case "refund_requested":
      return refundRequested(db, event);
  }
}

function refundRequested(
  db: Queryable,
  event: Extract<NotificationEvent, { type: "refund_requested" }>
): Delivery[] {
  const row = db
    .select({
      refundRequestId: refunds.id,
      purchaseId: purchases.id,
      amountPaid: purchases.amountPaid,
      buyerId: users.id,
      buyerName: users.name,
      courseId: courses.id,
      courseTitle: courses.title,
    })
    .from(refunds)
    .innerJoin(purchases, eq(purchases.id, refunds.purchaseId))
    .innerJoin(users, eq(users.id, purchases.userId))
    .innerJoin(courses, eq(courses.id, purchases.courseId))
    .where(eq(refunds.id, event.refundRequestId))
    .get();

  if (!row) throw new Error(`Refund Request ${event.refundRequestId} not found`);

  const facts = {
    refundRequestId: row.refundRequestId,
    purchaseId: row.purchaseId,
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    amountPaid: row.amountPaid,
  };

  // The receipt always goes to the buyer, even when they are the actor.
  const deliveries: Delivery[] = [
    { type: "refund_requested", recipientUserId: row.buyerId, payload: facts },
  ];

  // Admins resolve now, one trigger each; the actor is never told about their
  // own action.
  const admins = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, UserRole.Admin))
    .all();
  for (const admin of admins) {
    if (admin.id === event.actorUserId) continue;
    deliveries.push({
      type: "refund_awaiting_review",
      recipientUserId: admin.id,
      payload: { ...facts, buyerName: row.buyerName },
    });
  }

  return deliveries;
}

// ─── Transport ───
// The seam between the outbox and the outside world. Production will use Novu;
// with no NOVU_SECRET_KEY the dev transport writes JSON to .outbox/.

export type OutboundNotification = {
  /** The outbox row id. Identical on every retry of the same row. */
  idempotencyKey: string;
  type: NotificationType;
  /** Novu subscriber: the Cadence user id as a string. */
  subscriber: { id: string; email: string; name: string };
  payload: Record<string, unknown>;
};

export interface Transport {
  /** Resolve only after the receiver answered 2xx; throw TransportError otherwise. */
  send(message: OutboundNotification): Promise<void>;
}

export class TransportError extends Error {
  constructor(
    message: string,
    /** HTTP status, when the failure was an HTTP response. */
    readonly status?: number,
    /** Seconds from a Retry-After header. */
    readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

export function devTransport(directory: string): Transport {
  return {
    async send(message) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, `${Date.now()}-${message.idempotencyKey}.json`),
        JSON.stringify(message, null, 2)
      );
    },
  };
}

// ─── Worker ───

// Delay before attempt 2, 3, ... 7 (1 min, 5 min, 30 min, 2 h, 6 h, 24 h).
// After the seventh failure the row is dead.
const BACKOFF_MS = [
  60_000, 300_000, 1_800_000, 7_200_000, 21_600_000, 86_400_000,
];
const BATCH_SIZE = 20;

export type DrainOptions = {
  /** Defaults to the NOTIFICATIONS_ENABLED environment flag. */
  enabled?: boolean;
  transport?: Transport;
  now?: Date;
};

type OutboxRow = typeof notificationOutbox.$inferSelect;

export function notificationsEnabled() {
  return process.env.NOTIFICATIONS_ENABLED === "true";
}

export async function drainOutbox(db: Db, options: DrainOptions = {}) {
  const enabled = options.enabled ?? notificationsEnabled();
  if (!enabled) return;

  const transport = options.transport ?? defaultTransport();
  const now = options.now ?? new Date();

  const due = db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.status, OutboxStatus.Pending),
        lte(notificationOutbox.nextAttemptAt, now.toISOString())
      )
    )
    .orderBy(asc(notificationOutbox.id))
    .limit(BATCH_SIZE)
    .all();

  for (const row of due) {
    const recipient = db
      .select()
      .from(users)
      .where(eq(users.id, row.recipientUserId))
      .get();
    const started = Date.now();
    const attempt = row.attempts + 1;

    try {
      if (!recipient) throw new TransportError("Recipient not found", 404);
      await transport.send({
        idempotencyKey: String(row.id),
        type: row.type as NotificationType,
        subscriber: {
          id: String(recipient.id),
          email: recipient.email,
          name: recipient.name,
        },
        payload: JSON.parse(row.payload),
      });
      db.update(notificationOutbox)
        .set({
          status: OutboxStatus.Sent,
          attempts: attempt,
          sentAt: now.toISOString(),
          lastError: null,
        })
        .where(eq(notificationOutbox.id, row.id))
        .run();
      logAttempt(row, attempt, "sent", started);
    } catch (error) {
      logAttempt(row, attempt, recordFailure(db, row, attempt, error, now), started);
    }
  }
}

function recordFailure(
  db: Db,
  row: OutboxRow,
  attempt: number,
  error: unknown,
  now: Date
): "retry" | "dead" {
  const status = error instanceof TransportError ? error.status : undefined;
  const permanent =
    status !== undefined && status >= 400 && status < 500 && status !== 429;
  const backoff = BACKOFF_MS[attempt - 1];
  const dead = permanent || backoff === undefined;

  const retryAfterMs =
    error instanceof TransportError && error.retryAfterSeconds !== undefined
      ? error.retryAfterSeconds * 1000
      : 0;
  const delay = Math.max(backoff ?? 0, status === 429 ? retryAfterMs : 0);

  db.update(notificationOutbox)
    .set({
      status: dead ? OutboxStatus.Dead : OutboxStatus.Pending,
      attempts: attempt,
      lastError: error instanceof Error ? error.message : String(error),
      nextAttemptAt: new Date(now.getTime() + delay).toISOString(),
    })
    .where(eq(notificationOutbox.id, row.id))
    .run();
  return dead ? "dead" : "retry";
}

// One structured line per attempt. No emails or bodies.
function logAttempt(
  row: OutboxRow,
  attempt: number,
  outcome: string,
  started: number
) {
  console.log(
    JSON.stringify({
      event: "notification_attempt",
      outboxId: row.id,
      type: row.type,
      attempt,
      outcome,
      latencyMs: Date.now() - started,
    })
  );
}

function defaultTransport(): Transport {
  // The Novu transport arrives with the Novu integration ticket.
  return devTransport(".outbox");
}
