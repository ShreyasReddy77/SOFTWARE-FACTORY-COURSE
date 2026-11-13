import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq, lt, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  coupons,
  courses,
  enrollments,
  notificationOutbox,
  OutboxStatus,
  purchases,
  refunds,
  teamMembers,
  TeamMemberRole,
  users,
  UserRole,
} from "~/db/schema";
import { novuTransport } from "./novu-transport.server";

/** An ops alert email. */
export type Email = { to: string; subject: string; body: string };

// The old mailer module is gone. Until a real ops-alert sender is chosen, the
// default writes the alert to .outbox/ like the dev transport does.
async function sendEmail(email: Email): Promise<void> {
  mkdirSync(".outbox", { recursive: true });
  writeFileSync(
    join(".outbox", `${Date.now()}-alert-${email.to}.json`),
    JSON.stringify(email, null, 2)
  );
}

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

export type NotificationType =
  | "refund_requested"
  | "refund_awaiting_review"
  | "refund_approved"
  | "refund_declined"
  | "enrollment_ended"
  | "welcome"
  | "seat_claimed";

/** What happened. `actorUserId` is the person who did it. */
export type NotificationEvent =
  | {
      type: "refund_requested";
      refundRequestId: number;
      actorUserId: number;
    }
  | {
      type: "refund_approved";
      refundRequestId: number;
      actorUserId: number;
      /** True when approval removed the buyer's Enrollment. */
      enrollmentEnded: boolean;
    }
  | { type: "refund_declined"; refundRequestId: number; actorUserId: number }
  | {
      /** A new Enrollment (Individual Purchase or Claimed Seat). */
      type: "enrollment_created";
      enrollmentId: number;
    }
  | {
      /** A Student claimed a Seat; tells the Team Admin. */
      type: "seat_claimed";
      couponId: number;
    };

export function notify(
  db: Queryable,
  event: NotificationEvent,
  now = new Date()
) {
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

function resolveDeliveries(
  db: Queryable,
  event: NotificationEvent
): Delivery[] {
  switch (event.type) {
    case "refund_requested":
      return refundRequested(db, event);
    case "enrollment_created":
      return welcome(db, event);
    case "seat_claimed":
      return seatClaimed(db, event);
    case "refund_approved":
      return refundApproved(db, event);
    case "refund_declined":
      return refundDeclined(db, event);
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

  if (!row)
    throw new Error(`Refund Request ${event.refundRequestId} not found`);

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

function welcome(
  db: Queryable,
  event: Extract<NotificationEvent, { type: "enrollment_created" }>
): Delivery[] {
  const row = db
    .select({
      enrollmentId: enrollments.id,
      userId: enrollments.userId,
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(eq(enrollments.id, event.enrollmentId))
    .get();
  if (!row) throw new Error(`Enrollment ${event.enrollmentId} not found`);

  // Enrollment facts and a link to the course; no cross-sell.
  return [
    {
      type: "welcome",
      recipientUserId: row.userId,
      payload: {
        enrollmentId: row.enrollmentId,
        courseId: row.courseId,
        courseTitle: row.courseTitle,
        courseUrl: `/courses/${row.courseSlug}`,
      },
    },
  ];
}

function seatClaimed(
  db: Queryable,
  event: Extract<NotificationEvent, { type: "seat_claimed" }>
): Delivery[] {
  const row = db
    .select({
      couponId: coupons.id,
      teamId: coupons.teamId,
      courseId: courses.id,
      courseTitle: courses.title,
      claimerName: users.name,
    })
    .from(coupons)
    .innerJoin(courses, eq(courses.id, coupons.courseId))
    .innerJoin(users, eq(users.id, coupons.redeemedByUserId))
    .where(eq(coupons.id, event.couponId))
    .get();
  if (!row) throw new Error(`Claimed Seat ${event.couponId} not found`);

  const admins = db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, row.teamId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .all();

  // Deliberately says nothing about the licence becoming unrefundable.
  return admins.map((admin) => ({
    type: "seat_claimed" as const,
    recipientUserId: admin.userId,
    payload: {
      couponId: row.couponId,
      courseId: row.courseId,
      courseTitle: row.courseTitle,
      claimerName: row.claimerName,
    },
  }));
}

function loadDecidedRefund(db: Queryable, refundRequestId: number) {
  const row = db
    .select({
      refundRequestId: refunds.id,
      purchaseId: purchases.id,
      amountPaid: purchases.amountPaid,
      decisionNote: refunds.decisionNote,
      buyerId: purchases.userId,
      courseId: courses.id,
      courseTitle: courses.title,
    })
    .from(refunds)
    .innerJoin(purchases, eq(purchases.id, refunds.purchaseId))
    .innerJoin(courses, eq(courses.id, purchases.courseId))
    .where(eq(refunds.id, refundRequestId))
    .get();
  if (!row) throw new Error(`Refund Request ${refundRequestId} not found`);

  // A Team Licence is the Purchase that granted Seats.
  const isTeamLicence =
    db
      .select({ id: coupons.id })
      .from(coupons)
      .where(eq(coupons.purchaseId, row.purchaseId))
      .get() !== undefined;

  const facts = {
    refundRequestId: row.refundRequestId,
    purchaseId: row.purchaseId,
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    amountPaid: row.amountPaid,
    decisionNote: row.decisionNote,
  };
  return { row, facts, isTeamLicence };
}

// The buyer (the Team Admin for a Team Licence) hears the decision. Nobody is
// told about their own action.
function refundApproved(
  db: Queryable,
  event: Extract<NotificationEvent, { type: "refund_approved" }>
): Delivery[] {
  const { row, facts, isTeamLicence } = loadDecidedRefund(
    db,
    event.refundRequestId
  );
  if (row.buyerId === event.actorUserId) return [];

  const deliveries: Delivery[] = [
    { type: "refund_approved", recipientUserId: row.buyerId, payload: facts },
  ];
  // Only an Individual Purchase ends a Student's Enrollment.
  if (!isTeamLicence && event.enrollmentEnded) {
    deliveries.push({
      type: "enrollment_ended",
      recipientUserId: row.buyerId,
      payload: {
        refundRequestId: row.refundRequestId,
        courseId: row.courseId,
        courseTitle: row.courseTitle,
      },
    });
  }
  return deliveries;
}

function refundDeclined(
  db: Queryable,
  event: Extract<NotificationEvent, { type: "refund_declined" }>
): Delivery[] {
  const { row, facts } = loadDecidedRefund(db, event.refundRequestId);
  if (row.buyerId === event.actorUserId) return [];
  return [
    { type: "refund_declined", recipientUserId: row.buyerId, payload: facts },
  ];
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
const STALE_AFTER_MS = 15 * 60_000;
// Sent rows hold copies of personal data (ADR 0014), so they are pruned.
const SENT_RETENTION_MS = 7 * 86_400_000;

export type DrainOptions = {
  /** Defaults to the NOTIFICATIONS_ENABLED environment flag. */
  enabled?: boolean;
  transport?: Transport;
  now?: Date;
  /** Where alerts are emailed. Defaults to OPS_ALERT_EMAIL; unset means log only. */
  opsEmail?: string;
  /** Defaults to writing the alert to .outbox/. */
  sendAlert?: (email: Email) => Promise<void>;
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

  const deadIds: number[] = [];

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
      const outcome = recordFailure(db, row, attempt, error, now);
      logAttempt(row, attempt, outcome, started);
      if (outcome === "dead") deadIds.push(row.id);
    }
  }

  const target: AlertTarget = {
    opsEmail: options.opsEmail ?? process.env.OPS_ALERT_EMAIL,
    sendAlert: options.sendAlert ?? ((email) => sendEmail(email)),
  };
  for (const id of deadIds) {
    await raiseAlert(target, "dead", {
      outboxId: id,
      subject: `Notification ${id} is dead`,
      body: `Outbox row ${id} failed permanently and was kept for replay (npm run replay-dead-notifications).`,
    });
  }
  await alertOnStaleRow(db, target, now);
  pruneSentRows(db, now);
}

type AlertTarget = {
  opsEmail: string | undefined;
  sendAlert: (email: Email) => Promise<void>;
};

let lastStaleAlertAt = 0;

/** Test hook: forget when the stale-row alert last fired. */
export function resetAlertThrottle() {
  lastStaleAlertAt = 0;
}

async function alertOnStaleRow(db: Db, target: AlertTarget, now: Date) {
  const oldest = db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.status, OutboxStatus.Pending))
    .orderBy(asc(notificationOutbox.createdAt))
    .limit(1)
    .get();
  if (!oldest) return;
  const ageMs = now.getTime() - Date.parse(oldest.createdAt);
  if (ageMs <= STALE_AFTER_MS) return;
  // One alert per window, not one per drain.
  if (now.getTime() - lastStaleAlertAt < STALE_AFTER_MS) return;
  lastStaleAlertAt = now.getTime();

  const minutes = Math.floor(ageMs / 60_000);
  await raiseAlert(target, "stale", {
    outboxId: oldest.id,
    subject: `Notifications are stuck: oldest unsent is ${minutes} min old`,
    body: `Outbox row ${oldest.id} has been unsent for ${minutes} minutes.`,
  });
}

async function raiseAlert(
  target: AlertTarget,
  reason: "dead" | "stale",
  alert: { outboxId: number; subject: string; body: string }
) {
  console.log(
    JSON.stringify({
      event: "notification_alert",
      reason,
      outboxId: alert.outboxId,
    })
  );
  if (!target.opsEmail) return;
  try {
    await target.sendAlert({
      to: target.opsEmail,
      subject: alert.subject,
      body: alert.body,
    });
  } catch (error) {
    // A broken alert channel must not stop deliveries.
    console.log(
      JSON.stringify({
        event: "notification_alert_failed",
        reason,
        outboxId: alert.outboxId,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

/** Deletes sent rows older than the retention window. Returns how many. */
export function pruneSentRows(db: Queryable, now = new Date()) {
  const cutoff = new Date(now.getTime() - SENT_RETENTION_MS).toISOString();
  return db
    .delete(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.status, OutboxStatus.Sent),
        lt(notificationOutbox.sentAt, cutoff)
      )
    )
    .run().changes;
}

/** Puts every dead row back in the queue as new. Returns how many. */
export function replayDeadRows(db: Queryable, now = new Date()) {
  return db
    .update(notificationOutbox)
    .set({
      status: OutboxStatus.Pending,
      attempts: 0,
      nextAttemptAt: now.toISOString(),
      lastError: null,
    })
    .where(eq(notificationOutbox.status, OutboxStatus.Dead))
    .run().changes;
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
  const secretKey = process.env.NOVU_SECRET_KEY;
  if (secretKey) return novuTransport({ secretKey });
  return devTransport(".outbox");
}
