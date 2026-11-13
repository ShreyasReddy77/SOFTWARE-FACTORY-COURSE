import { createHmac, timingSafeEqual } from "node:crypto";

// One-click unsubscribe for Activity mail (types 10-13). The link in the email
// footer carries a signed token naming the user and one Activity type, so the
// route can turn that type's email off without a login. Transactional types
// are deliberately not in this list: they cannot be unsubscribed.

/** Activity type -> Novu workflow identifier. */
export const ACTIVITY_WORKFLOW_IDS = {
  new_enrollment: "new-enrollment",
  new_comment: "new-comment",
  comment_reply: "comment-reply",
  new_rating: "new-rating",
} as const;

export type ActivityType = keyof typeof ACTIVITY_WORKFLOW_IDS;

function isActivityType(value: string): value is ActivityType {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_WORKFLOW_IDS, value);
}

function sign(secret: string, userId: string, activityType: string) {
  return createHmac("sha256", secret)
    .update(`unsubscribe:${userId}:${activityType}`)
    .digest("base64url");
}

/** Token format: `<userId>.<activityType>.<signature>`. No expiry: unsubscribe links must keep working. */
export function signUnsubscribeToken(
  secret: string,
  userId: number,
  activityType: ActivityType
) {
  return `${userId}.${activityType}.${sign(secret, String(userId), activityType)}`;
}

export function verifyUnsubscribeToken(
  secret: string,
  token: string
): { userId: number; activityType: ActivityType } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userIdText, activityType, signature] = parts;
  if (!/^\d+$/.test(userIdText) || !isActivityType(activityType)) return null;

  const expected = Buffer.from(sign(secret, userIdText, activityType));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return { userId: Number(userIdText), activityType };
}

export type UnsubscribeOptions = {
  secretKey: string;
  userId: number;
  activityType: ActivityType;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  baseUrl?: string;
};

/**
 * Turns off the email channel for one Activity workflow via Novu's
 * subscriber preferences API. In-app stays on.
 */
export async function unsubscribeFromActivityType(options: UnsubscribeOptions) {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.novu.co";
  const workflowId = ACTIVITY_WORKFLOW_IDS[options.activityType];
  const response = await doFetch(
    `${baseUrl}/v1/subscribers/${options.userId}/preferences/${workflowId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `ApiKey ${options.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: { type: "email", enabled: false } }),
    }
  );
  if (!response.ok) {
    throw new Error(`Novu preferences update responded ${response.status}`);
  }
}

/**
 * The one-click unsubscribe link for an Activity email. The base URL comes from
 * APP_BASE_URL (default http://localhost:5173) and the secret from
 * NOTIFICATIONS_UNSUBSCRIBE_SECRET. Returns null when no secret is configured,
 * so a missing secret never fails the domain write that triggered the notify.
 */
export function buildUnsubscribeUrl(
  userId: number,
  activityType: ActivityType,
  options: { secret?: string; baseUrl?: string } = {}
): string | null {
  const secret = options.secret ?? process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET;
  if (!secret) return null;
  const baseUrl = (
    options.baseUrl ??
    process.env.APP_BASE_URL ??
    "http://localhost:5173"
  ).replace(/\/+$/, "");
  return `${baseUrl}/unsubscribe/${signUnsubscribeToken(secret, userId, activityType)}`;
}
