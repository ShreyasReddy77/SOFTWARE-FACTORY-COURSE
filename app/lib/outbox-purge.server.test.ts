import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { OutboxStatus, UserRole } from "~/db/schema";
import { purgeUserOutbox } from "./outbox-purge.server";

type TestDb = ReturnType<typeof createTestDb>;
let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

function addUser(name: string, role = UserRole.Student) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function addRow(
  recipientUserId: number,
  type: string,
  payload: Record<string, unknown>
) {
  return db
    .insert(schema.notificationOutbox)
    .values({
      type,
      recipientUserId,
      payload: JSON.stringify(payload),
      nextAttemptAt: new Date().toISOString(),
    })
    .returning()
    .get();
}

function rows() {
  return db.select().from(schema.notificationOutbox).all();
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

describe("purgeUserOutbox", () => {
  it("deletes every row addressed to the user, whatever its status", () => {
    const other = addUser("Other");
    addRow(base.user.id, "welcome", { courseTitle: "X" });
    const dead = addRow(base.user.id, "refund_declined", {
      decisionNote: "private",
    });
    db.update(schema.notificationOutbox)
      .set({ status: OutboxStatus.Dead })
      .where(eq(schema.notificationOutbox.id, dead.id))
      .run();
    const kept = addRow(other.id, "welcome", { courseTitle: "X" });

    const result = purgeUserOutbox(db, base.user.id);

    expect(result.deleted).toBe(2);
    expect(rows().map((r) => r.id)).toEqual([kept.id]);
  });

  it("scrubs the buyer name from rows sent to admins about the user's purchase", () => {
    const admin = addUser("Admin", UserRole.Admin);
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 4900,
      })
      .returning()
      .get();
    addRow(admin.id, "refund_awaiting_review", {
      purchaseId: purchase.id,
      buyerName: base.user.name,
      courseTitle: "X",
    });

    const result = purgeUserOutbox(db, base.user.id);

    expect(result.scrubbed).toBe(1);
    const payload = JSON.parse(rows()[0].payload);
    expect(payload.buyerName).toBe("Deleted user");
    expect(payload.courseTitle).toBe("X");
  });

  it("scrubs the claimer name from seat-claimed rows for Seats the user claimed", () => {
    const admin = addUser("Admin", UserRole.Admin);
    const team = db.insert(schema.teams).values({}).returning().get();
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: admin.id,
        courseId: base.course.id,
        amountPaid: 4900,
      })
      .returning()
      .get();
    const coupon = db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "ABC",
        purchaseId: purchase.id,
        redeemedByUserId: base.user.id,
      })
      .returning()
      .get();
    addRow(admin.id, "seat_claimed", {
      couponId: coupon.id,
      claimerName: base.user.name,
    });

    const result = purgeUserOutbox(db, base.user.id);

    expect(result.scrubbed).toBe(1);
    expect(JSON.parse(rows()[0].payload).claimerName).toBe("Deleted user");
  });

  it("leaves unrelated rows untouched", () => {
    const admin = addUser("Admin", UserRole.Admin);
    const stranger = addUser("Stranger");
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: stranger.id,
        courseId: base.course.id,
        amountPaid: 4900,
      })
      .returning()
      .get();
    addRow(admin.id, "refund_awaiting_review", {
      purchaseId: purchase.id,
      buyerName: "Stranger",
    });

    const result = purgeUserOutbox(db, base.user.id);

    expect(result).toEqual({ deleted: 0, scrubbed: 0 });
    expect(JSON.parse(rows()[0].payload).buyerName).toBe("Stranger");
  });
});
