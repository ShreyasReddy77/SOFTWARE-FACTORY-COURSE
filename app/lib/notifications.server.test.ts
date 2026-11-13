import { describe, it, expect, beforeEach, vi } from "vitest";
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
  pruneSentRows,
  replayDeadRows,
  resetAlertThrottle,
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

describe("notify: refund decisions", () => {
  function makeTeamLicence() {
    const team = db.insert(schema.teams).values({}).returning().get();
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "SEAT-1",
        purchaseId: db.select().from(schema.purchases).get()!.id,
      })
      .run();
  }

  it("tells the buyer their refund was approved, and the Student their Enrollment ended", () => {
    const admin = addUser("Pat", UserRole.Admin);

    notify(db, {
      type: "refund_approved",
      refundRequestId: refundId,
      actorUserId: admin.id,
      enrollmentEnded: true,
    });

    expect(outbox().map((r) => [r.type, r.recipientUserId])).toEqual([
      ["refund_approved", base.user.id],
      ["enrollment_ended", base.user.id],
    ]);
    expect(outbox()[0].payload).toMatchObject({
      refundRequestId: refundId,
      courseTitle: "Test Course",
      amountPaid: 4900,
    });
    expect(outbox()[1].payload).toMatchObject({
      courseId: base.course.id,
      courseTitle: "Test Course",
      progressKept: true,
    });
  });

  it("carries the Platform Admin note on an approval", () => {
    const admin = addUser("Pat", UserRole.Admin);
    db.update(schema.refunds)
      .set({ decisionNote: "Sorry it did not fit." })
      .run();

    notify(db, {
      type: "refund_approved",
      refundRequestId: refundId,
      actorUserId: admin.id,
      enrollmentEnded: false,
    });

    expect(outbox()[0].payload).toMatchObject({
      decisionNote: "Sorry it did not fit.",
    });
  });

  it("sends only Refund approved when the Enrollment was kept", () => {
    const admin = addUser("Pat", UserRole.Admin);

    notify(db, {
      type: "refund_approved",
      refundRequestId: refundId,
      actorUserId: admin.id,
      enrollmentEnded: false,
    });

    expect(outbox().map((r) => r.type)).toEqual(["refund_approved"]);
  });

  it("notifies the Team Admin, not a Student, for a Team Licence approval", () => {
    const admin = addUser("Pat", UserRole.Admin);
    makeTeamLicence();

    notify(db, {
      type: "refund_approved",
      refundRequestId: refundId,
      actorUserId: admin.id,
      enrollmentEnded: true,
    });

    expect(outbox().map((r) => [r.type, r.recipientUserId])).toEqual([
      ["refund_approved", base.user.id],
    ]);
  });

  it("includes the Platform Admin note when a refund is declined", () => {
    const admin = addUser("Pat", UserRole.Admin);
    db.update(schema.refunds)
      .set({ decisionNote: "You finished the course." })
      .run();

    notify(db, {
      type: "refund_declined",
      refundRequestId: refundId,
      actorUserId: admin.id,
    });

    expect(outbox()).toHaveLength(1);
    expect(outbox()[0]).toMatchObject({
      type: "refund_declined",
      recipientUserId: base.user.id,
      payload: {
        refundRequestId: refundId,
        courseTitle: "Test Course",
        decisionNote: "You finished the course.",
      },
    });
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

describe("drainOutbox concurrency", () => {
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

  it("sends a row once when two drains run at the same time", async () => {
    queueOne();
    const sent: string[] = [];
    const transport: Transport = {
      async send(message) {
        sent.push(message.idempotencyKey);
        await new Promise((resolve) => setTimeout(resolve, 10));
      },
    };

    await Promise.all([
      drainOutbox(db, { transport, enabled: true, now: NOW }),
      drainOutbox(db, { transport, enabled: true, now: NOW }),
    ]);

    expect(sent).toHaveLength(1);
    expect(outbox()[0].status).toBe(OutboxStatus.Sent);
  });

  it("picks a claimed row up again once its lease has expired", async () => {
    queueOne();
    const sent: string[] = [];
    // A worker that claims the row and then never finishes (crash).
    const hung: Transport = { send: () => new Promise(() => {}) };
    const ok: Transport = {
      async send(message) {
        sent.push(message.idempotencyKey);
      },
    };
    void drainOutbox(db, { transport: hung, enabled: true, now: NOW });

    await drainOutbox(db, {
      transport: ok,
      enabled: true,
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(sent).toHaveLength(0);

    await drainOutbox(db, {
      transport: ok,
      enabled: true,
      now: new Date(NOW.getTime() + 10 * 60_000),
    });
    expect(sent).toHaveLength(1);
  });
});

describe("drainOutbox reliability", () => {
  const NOW = new Date("2026-10-06T12:00:00.000Z");
  const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

  function queueOne(at = NOW) {
    notify(
      db,
      {
        type: "refund_requested",
        refundRequestId: refundId,
        actorUserId: base.user.id,
      },
      at
    );
  }

  const failing = (status: number): Transport => ({
    async send() {
      throw new TransportError("nope", status);
    },
  });

  function silenceLog() {
    return vi.spyOn(console, "log").mockImplementation(() => {});
  }

  beforeEach(() => {
    resetAlertThrottle();
  });

  it("does not mark a row sent until the transport resolves", async () => {
    queueOne();
    let statusWhileSending: string | undefined;
    const transport: Transport = {
      async send() {
        statusWhileSending = outbox()[0].status;
      },
    };
    const log = silenceLog();

    await drainOutbox(db, { transport, enabled: true, now: NOW });
    log.mockRestore();

    expect(statusWhileSending).toBe(OutboxStatus.Pending);
    expect(outbox()[0].status).toBe(OutboxStatus.Sent);
  });

  it("keeps a row pending when the transport fails with a plain Error", async () => {
    queueOne();
    const transport: Transport = {
      async send() {
        throw new Error("socket hang up");
      },
    };
    const log = silenceLog();

    await drainOutbox(db, { transport, enabled: true, now: NOW });
    log.mockRestore();

    expect(outbox()[0]).toMatchObject({
      status: OutboxStatus.Pending,
      attempts: 1,
      lastError: "socket hang up",
    });
  });

  it("walks the whole backoff schedule", async () => {
    queueOne();
    const log = silenceLog();
    const delays: number[] = [];
    let now = NOW;
    for (let i = 0; i < 6; i++) {
      await drainOutbox(db, { transport: failing(503), enabled: true, now });
      delays.push(Date.parse(outbox()[0].nextAttemptAt) - now.getTime());
      now = new Date(Date.parse(outbox()[0].nextAttemptAt));
    }
    log.mockRestore();
    expect(delays).toEqual([
      60_000, 300_000, 1_800_000, 7_200_000, 21_600_000, 86_400_000,
    ]);
  });

  it("logs one structured line per attempt without emails or bodies", async () => {
    queueOne();
    const log = silenceLog();
    await drainOutbox(db, {
      transport: failing(503),
      enabled: true,
      now: NOW,
    });
    const lines = log.mock.calls.map(([line]) => String(line));
    log.mockRestore();

    const attempts = lines
      .map((line) => JSON.parse(line))
      .filter((l) => l.event === "notification_attempt");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      outboxId: outbox()[0].id,
      type: "refund_requested",
      attempt: 1,
      outcome: "retry",
    });
    expect(typeof attempts[0].latencyMs).toBe("number");
    const text = lines.join("\n");
    expect(text).not.toContain("@example.com");
    expect(text).not.toContain("Test Course");
  });

  it("alerts by log and email to the ops address when a row goes dead", async () => {
    queueOne();
    const mail: { to: string; subject: string; body: string }[] = [];
    const log = silenceLog();
    await drainOutbox(db, {
      transport: failing(400),
      enabled: true,
      now: NOW,
      opsEmail: "ops@example.com",
      sendAlert: async (email) => void mail.push(email),
    });
    const alerts = log.mock.calls
      .map(([line]) => JSON.parse(String(line)))
      .filter((l) => l.event === "notification_alert");
    log.mockRestore();

    expect(alerts).toMatchObject([
      { reason: "dead", outboxId: outbox()[0].id },
    ]);
    expect(mail).toHaveLength(1);
    expect(mail[0].to).toBe("ops@example.com");
    expect(mail[0].subject).toContain("dead");
    expect(mail[0].body).not.toContain("@example.com");
  });

  function alertOptions(mail: unknown[]) {
    return {
      transport: failing(503),
      enabled: true,
      opsEmail: "ops@example.com",
      sendAlert: async (email: unknown) => void mail.push(email),
    };
  }

  it("alerts when a row has been due for over 15 minutes, once per window", async () => {
    queueOne();
    const mail: unknown[] = [];
    const log = silenceLog();

    await drainOutbox(db, { ...alertOptions(mail), now: minutes(16) });
    expect(mail).toHaveLength(1);

    await drainOutbox(db, { ...alertOptions(mail), now: minutes(20) });
    expect(mail).toHaveLength(1);
    log.mockRestore();
  });

  it("does not alert while the row has been due for under 15 minutes", async () => {
    queueOne();
    const mail: unknown[] = [];
    const log = silenceLog();

    await drainOutbox(db, { ...alertOptions(mail), now: minutes(14) });
    expect(mail).toHaveLength(0);
    log.mockRestore();
  });

  it("does not alert for an old row that is legitimately backing off", async () => {
    queueOne();
    db.update(schema.notificationOutbox)
      .set({
        attempts: 4,
        nextAttemptAt: minutes(60 * 5).toISOString(),
      })
      .run();
    const mail: unknown[] = [];
    const log = silenceLog();

    await drainOutbox(db, { ...alertOptions(mail), now: minutes(60 * 3) });
    expect(mail).toHaveLength(0);
    log.mockRestore();
  });

  it("does not let a failing alert email break the drain", async () => {
    queueOne();
    const log = silenceLog();
    await expect(
      drainOutbox(db, {
        transport: failing(400),
        enabled: true,
        now: NOW,
        opsEmail: "ops@example.com",
        sendAlert: async () => {
          throw new Error("postmark down");
        },
      })
    ).resolves.toBeUndefined();
    log.mockRestore();
  });

  it("replays dead rows from scratch with the same id", async () => {
    queueOne();
    const log = silenceLog();
    await drainOutbox(db, { transport: failing(400), enabled: true, now: NOW });
    log.mockRestore();
    const id = outbox()[0].id;
    const count = outbox().filter((r) => r.status === OutboxStatus.Dead).length;

    expect(replayDeadRows(db, minutes(60))).toBe(count);

    expect(outbox().find((r) => r.id === id)).toMatchObject({
      status: OutboxStatus.Pending,
      attempts: 0,
      nextAttemptAt: minutes(60).toISOString(),
    });
  });

  it("prunes sent rows past the retention window and keeps dead rows", async () => {
    queueOne();
    const log = silenceLog();
    await drainOutbox(db, {
      transport: { async send() {} },
      enabled: true,
      now: NOW,
    });
    log.mockRestore();
    db.insert(schema.notificationOutbox)
      .values({
        type: "refund_requested",
        recipientUserId: base.user.id,
        payload: "{}",
        status: OutboxStatus.Dead,
        nextAttemptAt: NOW.toISOString(),
        createdAt: NOW.toISOString(),
      })
      .run();
    const sentCount = outbox().filter(
      (r) => r.status === OutboxStatus.Sent
    ).length;

    expect(pruneSentRows(db, minutes(6 * 24 * 60))).toBe(0);
    expect(pruneSentRows(db, minutes(8 * 24 * 60))).toBe(sentCount);
    expect(outbox().map((r) => r.status)).toEqual([OutboxStatus.Dead]);
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
