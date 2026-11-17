import * as schema from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import { markdown } from "~/lib/text";
import { seedBaseData, type TestDb } from "~/test/setup";

/**
 * A course with one module of three lessons, the first two with content and
 * the second with a two-question quiz. Course structure belongs to the
 * instructor screens, not this module, so it is inserted directly.
 */
export function seedLessonPage(db: TestDb) {
  const base = seedBaseData(db);
  const mod = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  const [first, second, third] = [1, 2, 3].map((position) =>
    db
      .insert(schema.lessons)
      .values({
        moduleId: mod.id,
        title: `Lesson ${position}`,
        position,
        content: position === 3 ? null : markdown(`# Heading ${position}`),
        videoUrl: position === 1 ? "https://www.youtube.com/watch?v=abc" : null,
        durationMinutes: position === 1 ? 10 : null,
      })
      .returning()
      .get()
  );
  const { quiz, questions } = seedQuiz(db, second.id);
  return { ...base, mod, lessons: { first, second, third }, quiz, questions };
}

function seedQuiz(db: TestDb, lessonId: number) {
  const quiz = db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Check", passingScore: 0.7 })
    .returning()
    .get();
  const questions = [1, 2].map((position) => {
    const question = db
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: `Q${position}`,
        questionType: schema.QuestionType.MultipleChoice,
        position,
      })
      .returning()
      .get();
    const [right, wrong] = [true, false].map((isCorrect) =>
      db
        .insert(schema.quizOptions)
        .values({
          questionId: question.id,
          optionText: isCorrect ? "Right" : "Wrong",
          isCorrect,
        })
        .returning()
        .get()
    );
    return { question, right, wrong };
  });
  return { quiz, questions };
}

export function enroll(db: TestDb, userId: number, courseId: number) {
  db.insert(schema.enrollments).values({ userId, courseId }).run();
}

function makeRequest(headers: Record<string, string>, body?: FormData) {
  return new Request("http://localhost:3000/", {
    headers,
    method: body ? "POST" : "GET",
    body,
  });
}

/** A request signed in through the real session cookie, as DevUI does. */
export async function requestAs(
  userId: number | null,
  form?: Record<string, string>
) {
  // A header country keeps country resolution off the network.
  const headers: Record<string, string> = { "CF-IPCountry": "US" };
  if (userId !== null) {
    const setCookie = await setCurrentUserId(makeRequest({}), userId);
    headers.Cookie = setCookie.split(";")[0];
  }
  if (!form) return makeRequest(headers);
  const body = new FormData();
  for (const [key, value] of Object.entries(form)) body.set(key, value);
  return makeRequest(headers, body);
}

export function paramsFor(lessonId: number, slug = "test-course") {
  return { slug, lessonId: String(lessonId) };
}
