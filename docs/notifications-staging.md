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
- [ ] Create workflow `refund-approved` (sent to the buyer, or the Team Admin for a Team Licence): in-app step, then email step sent immediately.
- [ ] Create workflow `refund-declined` (same recipient; shows the Platform Admin note in `decisionNote`): in-app step, then email step sent immediately.
- [ ] Create workflow `enrollment-ended` (sent to the Student whose Individual Purchase was refunded; say their progress is kept): in-app step, then email step sent immediately.
- [ ] Refund email parity check (cannot be done in code): approve and decline a refund in staging with the flag on and compare the Novu emails with the old Postmark ones. The old mailer module has already been deleted; with `NOTIFICATIONS_ENABLED` off, refund notifications wait unsent in the outbox and are delivered when the flag is turned on.
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
`refund-approved` and `refund-declined` receive the same fields plus `decisionNote` (string or null; the Platform Admin note, always set on a decline).

`enrollment-ended` receives only `refundRequestId`, `courseId` and `courseTitle`.

## Error handling

2xx marks the row sent. 429 retries honouring `Retry-After` (seconds). Other 4xx marks the row dead. 5xx and network failures retry on the backoff schedule (1 min, 5 min, 30 min, 2 h, 6 h, 24 h, then dead).

## Compliance: email footers, headers and unsubscribe (ticket 23)

Footers, headers and templates live in Novu. None of this checklist is done by the code change.

### Config (one place each)

| Variable | Purpose |
| --- | --- |
| `NOTIFICATIONS_POSTAL_ADDRESS` | The physical address (real PO box or registered-agent address). Multi-line allowed. Shown on `/privacy`; paste the same value into the Activity template footer (Novu templates cannot read our env). **Rollout blocker until supplied.** |
| `PRIVACY_CONTACT_EMAIL` | Privacy contact shown on `/privacy`. |
| `NOTIFICATIONS_UNSUBSCRIBE_SECRET` | HMAC secret for signed unsubscribe tokens (`/unsubscribe/:token`). Generate a long random value. |

### Transactional footer (types 1-9, every Transactional workflow)

- [ ] Accurate `From` (verified Postmark sender) and `Reply-To` (monitored address).
- [ ] Footer line, exactly: `This is a required message about your account or purchase`
- [ ] Footer link: `Preferences` -> `<site origin>/inbox` (Preferences tab).
- [ ] Footer link: `Privacy notice` -> `<site origin>/privacy`.
- [ ] No unsubscribe link and no `List-Unsubscribe` header.

### Activity footer (types 10-13, every Activity workflow)

- [ ] Same accurate `From` / `Reply-To`.
- [ ] "Why you got this" line, e.g. `You got this because you teach <course> on Cadence.` (adapt per type: enrolment, comment, reply, rating).
- [ ] One-click unsubscribe link -> `<site origin>/unsubscribe/<token>` using `payload.unsubscribeUrl`. The token is made with `signUnsubscribeToken(secret, userId, activityType)` in `app/lib/unsubscribe.server.ts`. The Activity types (10-13) are not shipped yet; when they are, `notify()` must add `unsubscribeUrl` to their payloads.
- [ ] Headers on the email step (Novu email step custom headers, if the plan supports them; otherwise ask Novu/Postmark support): `List-Unsubscribe: <https://<site origin>/unsubscribe/<token>>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The route accepts the POST without login.
- [ ] Footer link: `Preferences` -> `<site origin>/inbox`; `Privacy notice` -> `<site origin>/privacy`.
- [ ] Physical address (the `NOTIFICATIONS_POSTAL_ADDRESS` value) in the footer.
- [ ] Workflow identifiers match `ACTIVITY_WORKFLOW_IDS` in `app/lib/unsubscribe.server.ts` (`new-enrollment`, `new-comment`, `comment-reply`, `new-rating`). Unsubscribe calls `PATCH /v1/subscribers/:id/preferences/:workflowId` with `{"channel":{"type":"email","enabled":false}}`; confirm in staging that this matches the current Novu API and that the workflow's email channel preference is user-editable.
- [ ] Staging check: click the unsubscribe link logged out; confirm only that type's email is off in Preferences and in-app stays on.

### Other

- [ ] Supply the postal address (rollout blocker).
- [ ] Check whether Postmark can delete individual messages (runbook does not depend on it).
- [ ] Deletion requests: follow `docs/deletion-runbook.md`.
