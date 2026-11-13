import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { TeamMemberRole } from "~/db/schema";
import { notify } from "./notifications.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

function outbox() {
  return db
    .select()
    .from(schema.notificationOutbox)
    .all()
    .map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
}

function enroll() {
  return db
    .insert(schema.enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .returning()
    .get();
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

describe("notify: welcome (type 8)", () => {
  it("welcomes the Student with Enrollment facts and a course link", () => {
    const enrollment = enroll();

    notify(db, { type: "enrollment_created", enrollmentId: enrollment.id });

    const rows = outbox().filter((r) => r.type === "welcome");
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("welcome");
    expect(rows[0].recipientUserId).toBe(base.user.id);
    expect(rows[0].payload).toEqual({
      enrollmentId: enrollment.id,
      courseId: base.course.id,
      courseTitle: "Test Course",
      courseUrl: "/courses/test-course",
    });
  });

  it("rolls back with the surrounding transaction", () => {
    expect(() =>
      db.transaction((tx) => {
        const e = tx
          .insert(schema.enrollments)
          .values({ userId: base.user.id, courseId: base.course.id })
          .returning()
          .get();
        notify(tx, { type: "enrollment_created", enrollmentId: e.id });
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(outbox()).toHaveLength(0);
  });
});

describe("notify: seat claimed (type 9)", () => {
  function seat() {
    const admin = db
      .insert(schema.users)
      .values({
        name: "Ada",
        email: "ada@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    const team = db.insert(schema.teams).values({}).returning().get();
    db.insert(schema.teamMembers)
      .values({ teamId: team.id, userId: admin.id, role: TeamMemberRole.Admin })
      .run();
    const purchase = db
      .insert(schema.purchases)
      .values({ userId: admin.id, courseId: base.course.id, amountPaid: 9800 })
      .returning()
      .get();
    const coupon = db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "abc",
        purchaseId: purchase.id,
        redeemedByUserId: base.user.id,
        redeemedAt: new Date().toISOString(),
      })
      .returning()
      .get();
    return { admin, coupon };
  }

  it("tells the Team Admin who claimed which course, with no refund wording", () => {
    const { admin, coupon } = seat();

    notify(db, { type: "seat_claimed", couponId: coupon.id });

    const rows = outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("seat_claimed");
    expect(rows[0].recipientUserId).toBe(admin.id);
    expect(rows[0].payload).toEqual({
      couponId: coupon.id,
      courseId: base.course.id,
      courseTitle: "Test Course",
      claimerName: "Test User",
    });
    expect(JSON.stringify(rows[0].payload).toLowerCase()).not.toContain(
      "refund"
    );
  });
});
