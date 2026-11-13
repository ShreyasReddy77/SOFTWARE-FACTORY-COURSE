# Notifications: Novu staging setup

The Novu transport (`app/lib/novu-transport.server.ts`) is selected when `NOVU_SECRET_KEY` is set; otherwise the dev transport writes JSON to `.outbox/`. The worker only runs when `NOTIFICATIONS_ENABLED=true`. See ADR 0013 and 0014.

Everything below needs a human with dashboard access. None of it is done by the code change.

## Checklist

- [ ] Create a Novu account and a **Development** environment in the **US region** (`api.novu.co`; do not use the EU region).
- [ ] Copy the environment's Secret Key into `NOVU_SECRET_KEY` and set `NOTIFICATIONS_ENABLED=true` in the staging environment.
- [ ] Configure **Postmark** as the email integration inside Novu (server token, verified sender signature/domain). Templates live in Novu, not in the repo.
- [ ] Create workflow `refund-requested` (the Refund receipt, sent to the buyer): in-app step, then email step sent immediately (Transactional, cannot be muted).
- [ ] Create workflow `refund-awaiting-review` (sent to each Platform Admin): in-app step, then email step sent immediately.
- [ ] Create workflow `welcome` (type 8, sent to the Student on a new Enrollment): in-app step, then **Delay 1 hour**, then email step with a **step condition: skip if the in-app message is read** (Novu "is read" step filter on the in-app step). Email states Enrollment facts and links to the course (`courseUrl`); no cross-sell.
- [ ] Create workflow `seat-claimed` (type 9, sent to the Team Admin when a Student claims a Seat): in-app step, then email step sent immediately. Copy must not mention the licence becoming unrefundable.
- [ ] Verify in the Novu dev environment: enrol; leave the welcome unread and confirm the email goes after 1 h; repeat with the in-app item read and confirm the email is skipped.
- [ ] Manual staging check: buy a course as an individual and claim a Seat; confirm the welcome (in-app now, email after 1 h if unread) and the Team Admin's seat-claimed (in-app and email immediately).
- [ ] Ask Novu support to enable idempotency on the organisation. The key lifetime is undocumented; ask for it. Until enabled, the `Idempotency-Key` header is sent but may be ignored, and a retry after a lost response can duplicate.
- [ ] Resolve the inbox retention conflict (30 days on the limits page vs 24 hours on the pricing page for Free) in the dashboard.
- [ ] Manual staging check: request a refund as a buyer. Confirm the buyer's refund receipt and every admin's awaiting-review notification arrive in-app and by email. Check the outbox row ends `sent` and the Novu activity feed shows the run.
- [ ] Confirm in the staging check that a second trigger with changed user email updates the Novu subscriber (the trigger upserts the subscriber from its `to` object; if it does not, add an explicit `PUT /v1/subscribers/:id` before triggering).
- [ ] Confirm a repeated trigger with the same `Idempotency-Key` does not produce a second run (only after Novu enables idempotency).

## What the transport sends

`POST https://api.novu.co/v1/events/trigger`, headers `Authorization: ApiKey <NOVU_SECRET_KEY>`, `Idempotency-Key: <outbox row id>`.

```json
{
  "name": "<workflow identifier>",
  "to": {
    "subscriberId": "<Cadence user id as string>",
    "email": "...",
    "firstName": "...",
    "lastName": "..."
  },
  "payload": { }
}
```

The `to` object creates the subscriber on first notify and updates it on later triggers (including an email change). There is no mapping table.

## Workflow payloads

Both workflows receive:

| Field | Type | Notes |
| --- | --- | --- |
| `refundRequestId` | number | |
| `purchaseId` | number | |
| `courseId` | number | |
| `courseTitle` | string | |
| `amountPaid` | number | Integer cents (ADR 0005); format in the template |

`refund-awaiting-review` also receives `buyerName` (string).

### `welcome` payload

| Field | Type | Notes |
| --- | --- | --- |
| `enrollmentId` | number | |
| `courseId` | number | |
| `courseTitle` | string | |
| `courseUrl` | string | Relative path (`/courses/<slug>`); prefix with the site origin in the template |

### `seat-claimed` payload

| Field | Type | Notes |
| --- | --- | --- |
| `couponId` | number | The Seat |
| `courseId` | number | |
| `courseTitle` | string | |
| `claimerName` | string | |

A Claimed Seat sends both: `welcome` to the claimer and `seat-claimed` to each Team Admin of the licence's team.

## Error handling

2xx marks the row sent. 429 retries honouring `Retry-After` (seconds). Other 4xx marks the row dead. 5xx and network failures retry on the backoff schedule (1 min, 5 min, 30 min, 2 h, 6 h, 24 h, then dead).
