# Novu: delay-until-unread, per-course digest, Postmark, retention, idempotency

Research date: 2026-11-13. Facts only; no recommendation. Answers GitHub issue #9 (parent map #2).

Method note: pages were read with a summarising fetch tool, so wording is as relayed from the cited pages, not verbatim. Plan limits change; re-check before relying.

## Answers

| Question | Answer |
|---|---|
| (a) Delay an email step and skip it if the in-app item was read | Supported |
| (b) Digest events into one email per course per Instructor over 1 hour | Supported |
| (c) Custom Postmark provider | Supported (built-in provider) |
| Inbox history retention | Free 30 days, Pro 90 days, Team 90 days, Enterprise custom (per limits page); conflicts with pricing page, see gaps |
| Idempotency enablement | Not on by default; email support@novu.co to enable for the organisation |

Because (a) and (b) are supported, no Knock comparison is included.

## (a) Delay, then skip email if in-app item was read

- Delay step pauses workflow execution for a duration. Types: fixed (seconds to months), scheduled (to a date/time in subscriber timezone), dynamic (duration or ISO-8601 timestamp from event payload). [delay config](https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/delay.md)
- Step conditions can reference a previous in-app step: `steps.<in-app-step-id>.read`, `.seen`, `.lastReadDate`, `.lastSeenDate`. The docs example is "skip the email if the in-app notification was read": condition requires `read` to be false, with a delay step between the in-app and email steps. [step conditions](https://docs.novu.co/platform/workflow/add-and-configure-steps/step-conditions.md)
- Dashboard JSONLogic form given: `{ "==": [{ "var": "steps.<stepId>.read" }, "false"] }` (note the string "false"). Steps run when the condition is true. [step conditions reference](https://docs.novu.co/.mintlify/skills/dashboard-workflows/references/step-conditions.md)
- The same pattern (in-app, delay, email only if still unread) is documented as a use case. [multi-channel fallback](https://docs.novu.co/guides/use-cases/multi-channel-fallback)
- Code-first framework equivalent: a `skip` callback on the step. [framework skip](https://docs.novu.co/framework/skip)
- Plan cap on delay duration (limits page): Free 1 day, Pro 7 days, Team 30 days, Enterprise custom. [limits](https://docs.novu.co/platform/developer/limits), [delay config](https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/delay.md)

## (b) Digest per course (per Instructor) over 1 hour

- Digest "collects events over time, groups them per subscriber, and then allows the workflow to continue once per digest window." [digest overview](https://docs.novu.co/platform/workflow/digest)
- Default grouping is by `subscriberId`; one additional aggregation key can be added from the event payload (example in docs: `payload.postId` for separate digests per post per subscriber). The key must come from the payload schema. So subscriber = Instructor with aggregation key `payload.courseId` yields one digest per Instructor per course. [digest config](https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/digest.md)
- Regular digest window units: seconds, minutes, hours, days, weeks, months, so 1 hour is expressible. Timed (scheduled) digest uses a cron expression, UTC. [digest config](https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/digest.md), [digest step reference](https://docs.novu.co/.mintlify/skills/dashboard-workflows/references/digest-step.md)
- Downstream steps read `steps.<digest-step-id>.events` (array) and `steps.<digest-step-id>.eventCount`. [digest step reference](https://docs.novu.co/.mintlify/skills/dashboard-workflows/references/digest-step.md)
- "When events repeat" option sends the first notification immediately and digests only if a similar one was recently sent (5 min, 30 min or custom). Default regular digest otherwise holds events for the window. [digest config](https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/digest.md)
- Plan cap on digest duration: Free 1 day, Pro 7 days, Team 30 days. [limits](https://docs.novu.co/platform/developer/limits)

## (c) Postmark

- Postmark is a built-in email provider. Setup: Integrations, Add a Provider, Postmark, enter the Postmark Server API token, set the From address to an authenticated sender (single sender or domain authentication in Postmark), mark Active. [Postmark integration](https://docs.novu.co/platform/integrations/email/postmark)

## Inbox history retention

Limits page ([limits](https://docs.novu.co/platform/developer/limits)):

| | Free | Pro | Team | Enterprise |
|---|---|---|---|---|
| Inbox feed retention | 30 days | 90 days | 90 days | Custom |
| Activity feed retention | 1 day | 7 days | 90 days | 90 days (relayed; custom stated elsewhere on page) |

## Idempotency

- `Idempotency-Key` header on `POST /v1/events/trigger` halts duplicates at the API layer, before queueing. Duplicate while first is in flight: `409 Conflict`. After completion: cached response, counted as one workflow run.
- "Idempotency is not enabled for all organizations. Contact support@novu.co to enable it."
- No TTL for idempotency keys stated on the page. `transactionId` retention "depends on your billing tier" and does not give the same protection.
- Source: [trigger event API](https://docs.novu.co/api-reference/events/trigger-event)

## Gaps and conflicts

- Conflict: the pricing page ([pricing](https://novu.co/pricing)) lists different numbers from the limits page. Pricing page: inbox feed retention 24h / 7d / 90d, activity feed 24h / 7d / 90d, digest window max 24h / 7d / 90d, delay max 1h / 24h / 7d (Free / Pro / Team). Limits and config docs: delay and digest 1d / 7d / 30d, inbox retention 30d / 90d / 90d. Not resolved; confirm with Novu support or the dashboard. Notably, the pricing-page Free delay max of 1 hour would still fit a 1-hour delay but leave no margin.
- Idempotency key TTL not found.
- Whether `steps.<id>.read` can be evaluated after a digest step (read status of one item when the email aggregates many) not documented; the docs example uses a single in-app step then delay then email.
- Interaction of digest with a read-based skip (e.g. in-app per event, then digest email only if unread) not documented.
- Several fetches were through a summarising tool; conditional syntax and limits were not seen as raw page text.
