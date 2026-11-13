import { describe, it, expect, vi } from "vitest";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeFromActivityType,
  buildUnsubscribeUrl,
} from "./unsubscribe.server";

describe("buildUnsubscribeUrl", () => {
  it("builds a verifiable /unsubscribe/<token> URL from the base URL", () => {
    const url = buildUnsubscribeUrl(7, "new_comment", {
      secret: "s3",
      baseUrl: "https://cadence.example/",
    });
    expect(url).toMatch(/^https:\/\/cadence\.example\/unsubscribe\/[^/]+$/);
    const token = (url ?? "").split("/unsubscribe/")[1];
    expect(verifyUnsubscribeToken("s3", token)).toEqual({
      userId: 7,
      activityType: "new_comment",
    });
  });

  it("returns null when no secret is configured", () => {
    expect(
      buildUnsubscribeUrl(7, "new_rating", { secret: "", baseUrl: "https://x" })
    ).toBeNull();
  });
});

const SECRET = "test-secret";

describe("unsubscribe tokens", () => {
  it("round-trips the user and Activity type", () => {
    const token = signUnsubscribeToken(SECRET, 7, "new_rating");
    expect(verifyUnsubscribeToken(SECRET, token)).toEqual({
      userId: 7,
      activityType: "new_rating",
    });
  });

  it("rejects a token signed with another secret", () => {
    const token = signUnsubscribeToken("other", 7, "new_rating");
    expect(verifyUnsubscribeToken(SECRET, token)).toBeNull();
  });

  it("rejects a tampered user id or type", () => {
    const token = signUnsubscribeToken(SECRET, 7, "new_rating");
    const [, type, sig] = token.split(".");
    expect(verifyUnsubscribeToken(SECRET, `8.${type}.${sig}`)).toBeNull();
    expect(
      verifyUnsubscribeToken(SECRET, `7.new_comment.${sig}`)
    ).toBeNull();
  });

  it("rejects malformed tokens and unknown Activity types", () => {
    expect(verifyUnsubscribeToken(SECRET, "")).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, "garbage")).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, "a.b.c.d")).toBeNull();
    const forged = signUnsubscribeToken(SECRET, 7, "welcome" as never);
    expect(verifyUnsubscribeToken(SECRET, forged)).toBeNull();
  });
});

describe("unsubscribeFromActivityType", () => {
  it("turns off only the email channel of that workflow for the subscriber", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    await unsubscribeFromActivityType({
      secretKey: "sk",
      userId: 7,
      activityType: "comment_reply",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.novu.co/v1/subscribers/7/preferences/comment-reply"
    );
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      channel: { type: "email", enabled: false },
    });
  });

  it("throws when Novu rejects the change", async () => {
    const fetchMock = vi.fn(async () => new Response("no", { status: 500 }));
    await expect(
      unsubscribeFromActivityType({
        secretKey: "sk",
        userId: 7,
        activityType: "new_rating",
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).rejects.toThrow();
  });
});
