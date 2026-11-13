import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { notify } from "./notifications.server";
import { verifyUnsubscribeToken } from "./unsubscribe.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;

beforeEach(() => {
  process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET = "test-secret";
  process.env.APP_BASE_URL = "https://cadence.test";
  db = createTestDb();
  base = seedBaseData(db);
  const mod = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "M", position: 1 })
    .returning()
    .get();
  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "L", position: 1 })
    .returning()
    .get().id;
});

function outbox() {
  return db
    .select()
    .from(schema.notificationOutbox)
    .all()
    .map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
}

function comment(userId: number, parentId: number | null = null) {
  return db
    .insert(schema.comments)
    .values({ lessonId, userId, parentId, body: "hello" })
    .returning()
    .get();
}

function otherStudent() {
  return db
    .insert(schema.users)
    .values({
      name: "Other",
      email: "o@example.com",
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

function verified(url: string) {
  return verifyUnsubscribeToken("test-secret", url.split("/unsubscribe/")[1]);
}

describe("notify: new enrollment (type 10)", () => {
  it("tells the Instructor, with courseId and a signed unsubscribe link", () => {
    const e = db
      .insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .returning()
      .get();
    notify(db, { type: "enrollment_created", enrollmentId: e.id });

    const rows = outbox().filter((r) => r.type === "new_enrollment");
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(base.instructor.id);
    expect(rows[0].payload).toMatchObject({
      enrollmentId: e.id,
      courseId: base.course.id,
      courseTitle: "Test Course",
      studentName: "Test User",
    });
    expect(rows[0].payload.unsubscribeUrl).toMatch(
      /^https:\/\/cadence\.test\/unsubscribe\//
    );
    expect(verified(rows[0].payload.unsubscribeUrl)).toEqual({
      userId: base.instructor.id,
      activityType: "new_enrollment",
    });
  });

  it("does not tell an Instructor who enrols in their own course", () => {
    const e = db
      .insert(schema.enrollments)
      .values({ userId: base.instructor.id, courseId: base.course.id })
      .returning()
      .get();
    notify(db, { type: "enrollment_created", enrollmentId: e.id });
    expect(outbox().map((r) => r.type)).toEqual(["welcome"]);
  });
});

describe("notify: comments (types 11, 12)", () => {
  it("tells the Instructor about a top-level comment", () => {
    const c = comment(base.user.id);
    notify(db, { type: "comment_created", commentId: c.id });
    const rows = outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("new_comment");
    expect(rows[0].recipientUserId).toBe(base.instructor.id);
    expect(rows[0].payload).toMatchObject({
      commentId: c.id,
      courseId: base.course.id,
      commenterName: "Test User",
      lessonId,
    });
    expect(verified(rows[0].payload.unsubscribeUrl)?.activityType).toBe(
      "new_comment"
    );
  });

  it("does not tell the Instructor about their own comment", () => {
    const c = comment(base.instructor.id);
    notify(db, { type: "comment_created", commentId: c.id });
    expect(outbox()).toEqual([]);
  });

  it("tells the parent author about a reply, not the Instructor", () => {
    const q = comment(base.user.id);
    const r = comment(base.instructor.id, q.id);
    notify(db, { type: "comment_created", commentId: r.id });
    const rows = outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("comment_reply");
    expect(rows[0].recipientUserId).toBe(base.user.id);
    expect(rows[0].payload).toMatchObject({
      commentId: r.id,
      parentCommentId: q.id,
      courseId: base.course.id,
      replierName: "Test Instructor",
    });
    expect(verified(rows[0].payload.unsubscribeUrl)).toEqual({
      userId: base.user.id,
      activityType: "comment_reply",
    });
  });

  it("does not tell anyone when replying to yourself", () => {
    const q = comment(base.user.id);
    const r = comment(base.user.id, q.id);
    notify(db, { type: "comment_created", commentId: r.id });
    expect(outbox()).toEqual([]);
  });

  it("a Student replying to another Student notifies only the parent author", () => {
    const other = otherStudent();
    const q = comment(other.id);
    const r = comment(base.user.id, q.id);
    notify(db, { type: "comment_created", commentId: r.id });
    expect(outbox().map((x) => [x.type, x.recipientUserId])).toEqual([
      ["comment_reply", other.id],
    ]);
  });
});

describe("notify: new rating (type 13)", () => {
  it("tells the Instructor, with the stars", () => {
    const rating = db
      .insert(schema.courseRatings)
      .values({ userId: base.user.id, courseId: base.course.id, rating: 4 })
      .returning()
      .get();
    notify(db, { type: "rating_created", ratingId: rating.id });
    const rows = outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("new_rating");
    expect(rows[0].recipientUserId).toBe(base.instructor.id);
    expect(rows[0].payload).toMatchObject({
      ratingId: rating.id,
      rating: 4,
      courseId: base.course.id,
      courseTitle: "Test Course",
    });
    expect(verified(rows[0].payload.unsubscribeUrl)?.activityType).toBe(
      "new_rating"
    );
  });

  it("does not tell an Instructor about their own rating", () => {
    const rating = db
      .insert(schema.courseRatings)
      .values({
        userId: base.instructor.id,
        courseId: base.course.id,
        rating: 5,
      })
      .returning()
      .get();
    notify(db, { type: "rating_created", ratingId: rating.id });
    expect(outbox()).toEqual([]);
  });
});
