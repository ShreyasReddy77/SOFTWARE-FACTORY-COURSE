# Notify through a SQLite outbox written in the same transaction as the domain change

When something happens that deserves a Notification, `notify()` writes one `notification_outbox` row per recipient inside the same SQLite transaction as the domain write. An in-process worker later hands each row to a transport (Novu in production, JSON files in `.outbox/` in development) at least once, using the row id as the `Idempotency-Key`. A row is marked sent only after a 2xx. Failures retry at 1 min, 5 min, 30 min, 2 h, 6 h and 24 h, then the row is `dead` and kept for replay; a 4xx other than 429 goes straight to `dead`, and 429 honours `Retry-After`. Everything is behind `NOTIFICATIONS_ENABLED`; with it off, rows wait unsent.

## Considered Options

- **Call Novu inline after the write and swallow failures.** Rejected: a Novu outage or a crash between commit and call silently loses Notifications, including money emails.
- **Call Novu inside the transaction.** Rejected: it ties every domain write to a network call.

## Consequences

A crash between Novu's 2xx and the "sent" mark sends a duplicate, which we accept. Outbox rows hold copies of personal data and must be purged in the deletion runbook. Sent rows should be pruned after delivery.
