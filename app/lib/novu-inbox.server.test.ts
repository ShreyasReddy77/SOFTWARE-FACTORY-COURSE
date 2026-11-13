import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { getInboxConfig, subscriberHash } from "./novu-inbox.server";

describe("subscriberHash", () => {
  it("is the hex HMAC-SHA256 of the subscriber id keyed by the secret", () => {
    const expected = createHmac("sha256", "secret").update("42").digest("hex");
    expect(subscriberHash("secret", "42")).toBe(expected);
  });

  it("differs per subscriber and per secret", () => {
    expect(subscriberHash("secret", "1")).not.toBe(subscriberHash("secret", "2"));
    expect(subscriberHash("a", "1")).not.toBe(subscriberHash("b", "1"));
  });
});

describe("getInboxConfig", () => {
  const env = {
    NOVU_SECRET_KEY: "sk-test",
    NOVU_APPLICATION_IDENTIFIER: "app-123",
  };

  it("returns the app id, subscriber id and hash, never the secret", () => {
    const config = getInboxConfig(7, env);
    expect(config).toEqual({
      applicationIdentifier: "app-123",
      subscriberId: "7",
      subscriberHash: subscriberHash("sk-test", "7"),
    });
    expect(JSON.stringify(config)).not.toContain("sk-test");
  });

  it("is null when the secret is unset", () => {
    expect(getInboxConfig(7, { NOVU_APPLICATION_IDENTIFIER: "app-123" })).toBeNull();
  });

  it("is null when the application identifier is unset", () => {
    expect(getInboxConfig(7, { NOVU_SECRET_KEY: "sk-test" })).toBeNull();
  });

  it("is null when nobody is signed in", () => {
    expect(getInboxConfig(null, env)).toBeNull();
  });
});
