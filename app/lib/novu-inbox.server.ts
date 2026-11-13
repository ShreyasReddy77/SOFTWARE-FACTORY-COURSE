import { createHmac } from "node:crypto";

// Inbox authentication for Novu's React components. The subscriber hash is an
// HMAC-SHA256 of the subscriber id keyed by the environment's secret key, so
// the browser can prove who it is without ever holding the secret.

export function subscriberHash(secretKey: string, subscriberId: string) {
  return createHmac("sha256", secretKey).update(subscriberId).digest("hex");
}

export type InboxConfig = {
  applicationIdentifier: string;
  subscriberId: string;
  subscriberHash: string;
};

type Env = Record<string, string | undefined>;

/**
 * Everything the browser needs to open the Inbox, or null when the Inbox is
 * unavailable (nobody signed in, or Novu is not configured). The secret key
 * is used here and never returned.
 */
export function getInboxConfig(
  userId: number | null,
  env: Env = process.env
): InboxConfig | null {
  const secretKey = env.NOVU_SECRET_KEY;
  const applicationIdentifier = env.NOVU_APPLICATION_IDENTIFIER;
  if (userId === null || !secretKey || !applicationIdentifier) return null;

  const subscriberId = String(userId);
  return {
    applicationIdentifier,
    subscriberId,
    subscriberHash: subscriberHash(secretKey, subscriberId),
  };
}
