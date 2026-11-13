import {
  TransportError,
  type NotificationType,
  type OutboundNotification,
  type Transport,
} from "./notifications.server";

// ─── Novu transport ───
// Triggers a Novu workflow per outbox row. US region only (ADR 0013).
//
// The trigger's `to` carries the full subscriber (id, email, name), which makes
// Novu create the subscriber on first notify and update it when the email has
// changed. Cadence keeps no mapping table: the subscriber id is the Cadence
// user id as a string. See docs/notifications-staging.md.

const NOVU_US_API = "https://api.novu.co";

/** Workflow identifiers to create in the Novu dashboard, one per type. */
const WORKFLOW_IDS: Record<NotificationType, string> = {
  refund_requested: "refund-requested",
  refund_awaiting_review: "refund-awaiting-review",
  welcome: "welcome",
  seat_claimed: "seat-claimed",
  refund_approved: "refund-approved",
  refund_declined: "refund-declined",
  enrollment_ended: "enrollment-ended",
};

export type NovuTransportOptions = {
  secretKey: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  baseUrl?: string;
};

export function novuTransport(options: NovuTransportOptions): Transport {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? NOVU_US_API;

  return {
    async send(message: OutboundNotification) {
      let response: Response;
      try {
        response = await doFetch(`${baseUrl}/v1/events/trigger`, {
          method: "POST",
          headers: {
            Authorization: `ApiKey ${options.secretKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            name: WORKFLOW_IDS[message.type],
            to: toSubscriber(message.subscriber),
            payload: message.payload,
          }),
        });
      } catch (error) {
        // No status: the worker treats this as retryable.
        const reason = error instanceof Error ? error.message : "unknown error";
        throw new TransportError(`Novu request failed: ${reason}`);
      }

      if (response.ok) return;

      // Never echo the response body: it may hold personal data.
      throw new TransportError(
        `Novu responded ${response.status}`,
        response.status,
        parseRetryAfter(response.headers.get("Retry-After"))
      );
    },
  };
}

function toSubscriber(subscriber: OutboundNotification["subscriber"]) {
  const [firstName, ...rest] = subscriber.name.trim().split(/\s+/);
  const lastName = rest.join(" ");
  return {
    subscriberId: subscriber.id,
    email: subscriber.email,
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
  };
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value);
}
