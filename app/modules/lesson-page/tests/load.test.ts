import { describe, it, expect, beforeEach, vi } from "vitest";
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

import { actOnLessonPage, loadLessonPage } from "../index.server";

let db: TestDb;
let seed: ReturnType<typeof seedLessonPage>;

beforeEach(() => {
  db = createTestDb();
  holder.db = db;
  seed = seedLessonPage(db);
});

async function load(userId: number | null, lessonId: number, slug?: string) {
  return loadLessonPage({
    params: paramsFor(lessonId, slug),
    request: await requestAs(userId),
  });
}

async function status(promise: Promise<unknown>) {
  try {
    await promise;
    return 200;
  } catch (error) {
    return (error as { init?: { status?: number } }).init?.status;
  }
}

describe("loadLessonPage", () => {
  it("is not found for a lesson in another course", async () => {
    expect(
      await status(load(seed.user.id, seed.lessons.first.id, "nope"))
    ).toBe(404);
  });

  it("shows a signed-out visitor the locked view with the outline", async () => {
    const page = await load(null, seed.lessons.first.id);
    expect(page).toMatchObject({
      view: "locked",
      lesson: { id: seed.lessons.first.id, title: "Lesson 1" },
      module: { id: seed.mod.id, title: "Basics" },
      lockedReason: { kind: "signed-out" },
    });
    expect(page.curriculum[0].lessons.map((l) => l.title)).toEqual([
      "Lesson 1",
      "Lesson 2",
      "Lesson 3",
    ]);
    expect(page).not.toHaveProperty("contentHtml");
  });

  it("gives an enrolled Student the full lesson and marks it in progress", async () => {
    enroll(db, seed.user.id, seed.course.id);
    const page = await load(seed.user.id, seed.lessons.first.id);
    if (page.view !== "full") throw new Error("expected the full view");

    expect(page.contentHtml).toContain("Heading 1");
    expect(page.lessonStatus).toBe("in_progress");
    expect(page.lessonProgressMap).toEqual({
      [seed.lessons.first.id]: "in_progress",
    });
    expect(page.prevLesson).toBeNull();
    expect(page.nextLesson).toMatchObject({ id: seed.lessons.second.id });
    expect(page.instructorName).toBe("Test Instructor");
    expect(page.bookmarked).toBe(false);
    expect(page.note).toBeNull();
    expect(page.quiz).toBeNull();
    expect(page.comments).toEqual([]);
  });

  it("serves the quiz without revealing the right answers", async () => {
    enroll(db, seed.user.id, seed.course.id);
    const page = await load(seed.user.id, seed.lessons.second.id);
    if (page.view !== "full") throw new Error("expected the full view");

    expect(page.prevLesson).toMatchObject({ id: seed.lessons.first.id });
    expect(page.quiz?.questions).toHaveLength(2);
    expect(page.quiz?.questions[0].options).toEqual([
      { id: seed.questions[0].right.id, optionText: "Right" },
      { id: seed.questions[0].wrong.id, optionText: "Wrong" },
    ]);
    expect(page.bestAttempt).toBeNull();
  });

  it("returns the Student's saved Note and Bookmark", async () => {
    enroll(db, seed.user.id, seed.course.id);
    const lessonId = seed.lessons.first.id;
    const act = async (form: Record<string, string>) =>
      actOnLessonPage({
        params: paramsFor(lessonId),
        request: await requestAs(seed.user.id, form),
      });

    expect(await act({ intent: "save-note", body: "  Rewatch  " })).toEqual({
      ok: true,
    });
    expect(await act({ intent: "toggle-bookmark" })).toEqual({
      ok: true,
      bookmarked: true,
    });

    const page = await load(seed.user.id, lessonId);
    if (page.view !== "full") throw new Error("expected the full view");
    expect(page.note?.body).toBe("Rewatch");
    expect(page.bookmarked).toBe(true);
  });
});
