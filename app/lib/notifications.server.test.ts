import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { OutboxStatus, UserRole } from "~/db/schema";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  devTransport,
  drainOutbox,
  notify,
  TransportError,
  type OutboundNotification,
  type Transport,
} from "./notifications.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let refundId: number;

function addUser(name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function outbox() {
  return db
    .select()
    .from(schema.notificationOutbox)
    .all()
    .map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 4900,
    })
    .returning()
    .get();
  refundId = db
    .insert(schema.refunds)
    .values({ purchaseId: purchase.id, reason: "Not what I expected" })
    .returning()
    .get().id;
});

describe("notify: refund requested", () => {
  it("writes a receipt for the buyer", () => {
    addUser("Pat", UserRole.Admin);

    notify(db, {
      type: "refund_requested",
      refundRequestId: refundId,
      actorUserId: base.user.id,
    });

    const receipt = outbox().filter((r) => r.type === "refund_requested");
    expect(receipt).toHaveLength(1);
    expect(receipt[0]).toMatchObject({
      recipientUserId: base.user.id,
      status: OutboxStatus.Pending,
      attempts: 0,
      payload: {
        refundRequestId: refundId,
        courseTitle: "Test Course",
        amountPaid: 4900,
      },
    });
  });

  it("writes one awaiting-review row per Platform Admin", () => {
    const pat = addUser("Pat", UserRole.Admin);
    const sam = addUser("Sam", UserRole.Admin);
    addUser("Ivy", UserRole.Instructor);

    notify(db, {
      type: "refund_requested",
      refundRequestId: refundId,
      actorUserId: base.user.id,
    });

    const review = outbox().filter((r) => r.type === "refund_awaiting_review");
    expect(review.map((r) => r.recipientUserId).sort()).toEqual(
      [pat.id, sam.id].sort()
    );
    expect(review[0].payload).toMatchObject({
      refundRequestId: refundId,
      courseTitle: "Test Course",
      buyerName: base.user.name,
    });
  });

  it("does not tell an admin about their own request, but still sends the receipt", () => {
    const pat = addUser("Pat", UserRole.Admin);
    const other = addUser("Sam", UserRole.Admin);

    notify(db, {
      type: "refund_requested",
      refundRequestId: refundId,
      actorUserId: base.user.id,
    });
    db.delete(schema.notificationOutbox).run();

    // Pat is both buyer and Platform Admin.
    db.update(schema.purchases).set({ userId: pat.id }).run();
    notify(db, {
      type: "refund_requested",
      refundRequestId: refundId,
      actorUserId: pat.id,
    });

    expect(
      outbox().map((r) => [r.type, r.recipientUserId])
    ).toEqual([
      ["refund_requested", pat.id],
      ["refund_awaiting_review", other.id],
    ]);
  });

  it("rolls the rows back with the surrounding transaction", () => {
    addUser("Pat", UserRole.Admin);

    expect(() =>
      db.transaction((tx) => {
        notify(tx, {
          type: "refund_requested",
          refundRequestId: refundId,
          actorUserId: base.user.id,
        });
        throw new Error("domain write failed");
      })
    ).toThrow();

    expect(outbox()).toHaveLength(0);
  });
});

describe("drainOutbox", () => {
  const NOW = new Date("2026-10-06T12:00:00.000Z");

  function queueOne() {
    notify(
      db,
      {
        type: "refund_requested",
        refundRequestId: refundId,
        actorUserId: base.user.id,
      },
      NOW
    );
  }

  function fakeTransport(
    behaviour: () => Promise<void> = async () => {}
  ): Transport & { sent: OutboundNotification[] } {
    const sent: OutboundNotification[] = [];
    return {
      sent,
      async send(message) {
        sent.push(message);
        await behaviour();
      },
    };
  }

  it("delivers nothing and leaves rows unsent when notifications are disabled", async () => {
    queueOne();
    const transport = fakeTransport();

    await drainOutbox(db, { transport, enabled: false, now: NOW });

    expect(transport.sent).toHaveLength(0);
    expect(outbox().every((r) => r.status === OutboxStatus.Pending)).toBe(true);
  });

  it("hands each row to the transport with the row id as idempotency key, then marks it sent", async () => {
    queueOne();
    const transport = fakeTransport();

    await drainOutbox(db, { transport, enabled: true, now: NOW });

    const [row] = outbox();
    expect(transport.sent).toEqual([
      {
        idempotencyKey: String(row.id),
        type: "refund_requested",
        subscriber: {
          id: String(base.user.id),
          email: base.user.email,
          name: base.user.name,
        },
        payload: row.payload,
      },
    ]);
    expect(row).toMatchObject({
      status: OutboxStatus.Sent,
      sentAt: NOW.toISOString(),
    });
  });

  it("retries a failure on the backoff schedule, reusing the idempotency key", async () => {
    queueOne();
    const transport = fakeTransport(async () => {
      throw new TransportError("boom", 503);
    });

    await drainOutbox(db, { transport, enabled: true, now: NOW });
    expect(outbox()[0]).toMatchObject({
      status: OutboxStatus.Pending,
      attempts: 1,
      nextAttemptAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });

    // Not due yet: nothing is sent.
    await drainOutbox(db, { transport, enabled: true, now: NOW });
    expect(transport.sent).toHaveLength(1);

    const later = new Date(NOW.getTime() + 60_000);
    await drainOutbox(db, { transport, enabled: true, now: later });
    expect(transport.sent).toHaveLength(2);
    expect(transport.sent[1].idempotencyKey).toBe(
      transport.sent[0].idempotencyKey
    );
    expect(outbox()[0].nextAttemptAt).toBe(
      new Date(later.getTime() + 5 * 60_000).toISOString()
    );
  });

  it("marks a row dead after the last retry", async () => {
    queueOne();
    const transport = fakeTransport(async () => {
      throw new TransportError("boom", 503);
    });

    let now = NOW;
    for (let i = 0; i < 7; i++) {
      await drainOutbox(db, { transport, enabled: true, now });
      now = new Date(now.getTime() + 24 * 3_600_000);
    }

    expect(outbox()[0]).toMatchObject({
      status: OutboxStatus.Dead,
      attempts: 7,
    });
  });

  it("sends a 4xx other than 429 straight to dead", async () => {
    queueOne();
    const transport = fakeTransport(async () => {
      throw new TransportError("bad request", 400);
    });

    await drainOutbox(db, { transport, enabled: true, now: NOW });

    expect(outbox()[0]).toMatchObject({
      status: OutboxStatus.Dead,
      attempts: 1,
    });
  });

  it("retries a 429 no sooner than Retry-After", async () => {
    queueOne();
    const transport = fakeTransport(async () => {
      throw new TransportError("slow down", 429, 600);
    });

    await drainOutbox(db, { transport, enabled: true, now: NOW });

    expect(outbox()[0]).toMatchObject({
      status: OutboxStatus.Pending,
      nextAttemptAt: new Date(NOW.getTime() + 600_000).toISOString(),
    });
  });
});

describe("devTransport", () => {
  it("writes the message as JSON into the directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "outbox-"));
    const message: OutboundNotification = {
      idempotencyKey: "7",
      type: "refund_requested",
      subscriber: { id: "1", email: "a@example.com", name: "A" },
      payload: { courseTitle: "X" },
    };

    await devTransport(dir).send(message);

    const [file] = readdirSync(dir);
    expect(JSON.parse(readFileSync(join(dir, file), "utf8"))).toEqual(message);
  });
});
