# Use Novu with Postmark as its email provider, and let Novu own the Inbox

Cadence sends Notifications through Novu. Novu holds the Inbox items, read and seen state, per-person preferences, delay and digest steps and delivery logs; Postmark stays the email provider underneath it. Cadence keeps no copy of that state, only the transient outbox (ADR 0014). We verified that Novu can delay an email step and skip it when the in-app item has been read, that a digest can be keyed per subscriber and course, and that Postmark is a built-in provider. The Novu subscriber id is the Cadence user id as a string, so no mapping table is needed. Templates and workflows live in Novu, not in the repo.

## Considered Options

- **Knock, Courier, MagicBell, SuprSend, OneSignal.** Rejected: none beat Novu on the verified delay-then-skip and keyed digest behaviour at our size, and Novu can add web push later.
- **Build our own.** Rejected: read state, preferences, digests and delivery logs are a product in themselves, for no gain.

## Consequences

Notification content and read state live with a US processor, so the privacy notice and a deletion runbook must cover Novu. Novu's free plan caps monthly runs and inbox history. Digests do not support read-skip, so Instructor digests always send.
