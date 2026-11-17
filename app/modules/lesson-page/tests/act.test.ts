import { describe, it, expect, beforeEach, vi } from "vitest";
import * as schema from "~/db/schema";
import { createTestDb, type TestDb } from "~/test/setup";
import { enroll, paramsFor, requestAs, seedLessonPage } from "./fixtures";

const holder = vi.hoisted(() => ({ db: undefined as unknown as object }));
// Modules bind `db` at import time, so forward to whichever test db is live.
vi.mock("~/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const value = Reflect.get(holder.db, prop);
        return typeof value === "function" ? value.bind(holder.db) : value;
      },
    }
  ),
}));
vi.mock("~/lib/notifications.server", async (importOriginal) => {
  const { fakeNotifications } = await import("~/lib/notifications.fake.server");
  const notifications = fakeNotifications();
  return {
    ...(await importOriginal<object>()),
    defaultNotifications: async () => notifications,
  };
});

import { actOnLessonPage, loadLessonPage } from "../index.server";

let db: TestDb;
let seed: ReturnType<typeof seedLessonPage>;

beforeEach(() => {
  db = createTestDb();
  holder.db = db;
  seed = seedLessonPage(db);
  enroll(db, seed.user.id, seed.course.id);
});

async function act(
  form: Record<string, string>,
  { lessonId = seed.lessons.first.id, userId = seed.user.id } = {}
) {
  return actOnLessonPage({
    params: paramsFor(lessonId),
    request: await requestAs(userId, form),
  });
}

async function fullPage(lessonId = seed.lessons.first.id) {
  const page = await loadLessonPage({
    params: paramsFor(lessonId),
    request: await requestAs(seed.user.id),
  });
  if (page.view !== "full") throw new Error("expected the full view");
  return page;
}

async function status(promise: Promise<unknown>) {
  try {
    await promise;
    return 200;
  } catch (error) {
    return (error as { init?: { status?: number } }).init?.status;
  }
}

describe("actOnLessonPage", () => {
  it("rejects an unknown intent", async () => {
    expect(await status(act({ intent: "nope" }))).toBe(400);
  });

  it("refuses a Student who is not enrolled", async () => {
    const outsider = db
      .insert(schema.users)
      .values({
        name: "Outsider",
        email: "out@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    const save = act(
      { intent: "save-note", body: "x" },
      { userId: outsider.id }
    );
    expect(await status(save)).toBe(403);
  });

  it("refuses a signed-out visitor", async () => {
    const save = actOnLessonPage({
      params: paramsFor(seed.lessons.first.id),
      request: await requestAs(null, { intent: "save-note", body: "x" }),
    });
    expect(await status(save)).toBe(401);
  });

  it("explains why an empty Note was not saved", async () => {
    expect(await act({ intent: "save-note", body: "   " })).toEqual({
      ok: false,
      error: "Write something before saving your note.",
    });
  });

  it("explains why an over-long Note was not saved", async () => {
    const result = await act({ intent: "save-note", body: "a".repeat(2001) });
    expect(result).toEqual({
      ok: false,
      error: "Your note is over 2,000 characters, so it was not saved.",
    });
  });

  it("marks the lesson complete", async () => {
    expect(await act({ intent: "mark-complete" })).toEqual({ success: true });
    expect((await fullPage()).lessonStatus).toBe("completed");
  });

  it("posts, edits and deletes a comment on the lesson", async () => {
    expect(await act({ intent: "create-comment", body: "Why?" })).toEqual({
      ok: true,
    });
    const [comment] = (await fullPage()).comments;
    expect(comment).toMatchObject({ author: { id: seed.user.id } });
    expect(comment.bodyHtml).toContain("Why?");

    expect(
      await act({
        intent: "edit-comment",
        commentId: String(comment.id),
        body: "Why not?",
      })
    ).toEqual({ ok: true });
    expect((await fullPage()).comments[0].bodyHtml).toContain("Why not?");

    expect(
      await act({ intent: "delete-comment", commentId: String(comment.id) })
    ).toEqual({ ok: true });
    expect((await fullPage()).comments).toEqual([]);
  });

  it("asks for a body before posting a comment", async () => {
    expect(await act({ intent: "create-comment" })).toEqual({
      ok: false,
      error: "Enter a comment before posting.",
    });
  });

  it("does not reach a comment on another lesson", async () => {
    await act({ intent: "create-comment", body: "Elsewhere" });
    const [comment] = (await fullPage()).comments;
    const edit = act(
      { intent: "edit-comment", commentId: String(comment.id), body: "x" },
      { lessonId: seed.lessons.second.id }
    );
    expect(await status(edit)).toBe(404);
  });

  it("scores a quiz attempt and remembers the best one", async () => {
    const [q1, q2] = seed.questions;
    const result = await act(
      {
        intent: "submit-quiz",
        quizId: String(seed.quiz.id),
        [`question-${q1.question.id}`]: String(q1.right.id),
        [`question-${q2.question.id}`]: String(q2.wrong.id),
      },
      { lessonId: seed.lessons.second.id }
    );
    expect(result).toMatchObject({
      quizResult: {
        score: 0.5,
        passed: false,
        grade: "F",
        totalCorrect: 1,
        totalQuestions: 2,
        questionResults: [
          { questionId: q1.question.id, correct: true },
          { questionId: q2.question.id, correct: false },
        ],
      },
    });
    expect((await fullPage(seed.lessons.second.id)).bestAttempt).toEqual({
      score: 0.5,
      passed: false,
    });
  });

  it("does not score a quiz from another lesson", async () => {
    const submit = act({ intent: "submit-quiz", quizId: String(seed.quiz.id) });
    expect(await status(submit)).toBe(404);
  });
});
