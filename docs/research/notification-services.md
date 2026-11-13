# Third-party notification services for Cadence

Research date: 2026-11-13. Facts only; no recommendation. Needs: production-grade in-app inbox, browser web push, and email in a React Router + Node + SQLite app.

Method note: pages were read with a summarising fetch tool, so figures are as relayed from the cited pages. Pricing changes often; re-check before relying. "Not found" means not stated on the pages reviewed, not that the feature is absent.

## Summary matrix

| Service | React inbox UI | Headless | Web push | Free tier | First paid tier |
|---|---|---|---|---|---|
| Knock | `@knocklabs/react`: NotificationFeedPopover, NotificationFeed, NotificationIconButton | React hooks | No first-party channel; via FCM (browser token obtained with Firebase SDK) | 10,000 messages/mo, 500 guide recipients | Starter $250/mo, 50,000 msgs then $0.005 each |
| Novu | `@novu/react` Inbox (Bell, Notifications, Preferences, InboxContent) | `@novu/react` / `@novu/js` hooks | Via Pushpad provider; Push Webhook provider | 10,000 workflow runs/mo | Pro from $30/mo, 30,000+ runs |
| Courier | `@trycourier/courier-react` (React 18+): Inbox, Toasts, Preference Center | Not confirmed | Native browser web push channel not confirmed; many push providers (FCM, OneSignal, Pusher Beams, MagicBell, NowPush, ...) | 10,000 sends/mo | Business $0.005 per send |
| MagicBell | `@magicbell/react` Provider, FloatingInbox, Inbox | Not confirmed | Built in (Chrome, Firefox, Safari); `@magicbell/webpush` + service worker script | 1,000 deliveries/mo | Startup $249/mo, 50,000 deliveries then $0.0025 each |
| SuprSend | `@suprsend/react` drop-in inbox | Yes | Built in; VAPID key per account, service worker script from CDN | 10,000 notifications/mo | Essentials $100/mo (annual billing) |
| OneSignal | No inbox/message-center found | n/a | Native web push (service worker, HTTPS) | Email 10,000 sends/mo; web push max 10,000 subscribers per send; mobile push and in-app unlimited to 1,000 MAU | Growth from $19/mo |

## Per service

### Knock
- Pricing: Free $0 (10,000 messages/mo, 500 guide recipients); Starter $250/mo (50,000 messages then $0.005 each; 2,500 guide recipients then $0.05 each); Enterprise custom. All tiers: unlimited channels. [pricing](https://knock.app/pricing)
- SLA/retention: 99.9% uptime on Free/Starter; log retention 30 days (Free/Starter), 90 days (Enterprise). HIPAA and SAML SSO on Enterprise. [pricing](https://knock.app/pricing)
- React: `@knocklabs/react` with NotificationFeedPopover, NotificationFeed, NotificationIconButton, plus React hooks for custom UIs; core in `@knocklabs/client`. [docs](https://docs.knock.app/in-app-ui/react/overview)
- Push: providers are Amazon SNS, APNs, Expo, Firebase Cloud Messaging, OneSignal. [docs](https://docs.knock.app/integrations/push/overview) Per search-result summaries of the docs, there is no first-party web push channel; web push is sent via FCM, with the token read in-browser via Firebase SDK and stored as channel data. [tutorial](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm)
- Idempotency: `Idempotency-Key` header on `POST /workflows/:key/trigger` only; same key within 24h returns the original response (per search-result summary of Knock docs; see [triggering workflows](https://docs.knock.app/send-notifications/triggering-workflows/api)). The dedicated idempotence page URL I tried returned 404.
- Preferences: `PreferenceSet` JSON of opted-out channel types, categories and workflows; conditions; UI components and hosted preference center. [docs](https://docs.knock.app/concepts/preferences)
- Compliance: Enterprise HIPAA. Security page fetch failed (404); SOC 2, GDPR and regions not verified.

### Novu
- Pricing: Free $0 (10,000 workflow runs, 5 workflows, 24-hour activity feed retention, 3 team members); Pro from $30/mo (30,000+ runs, 7-day retention); Team from $250/mo (250,000+ runs, 90-day retention, 600 RPS trigger throughput); Enterprise custom (HIPAA BAA, SSO, self-hosted, extra regions). [pricing](https://novu.co/pricing)
- SLA: 99.9% uptime standard across plans per pricing page. Open source; self-hosted listed under Enterprise.
- React: `@novu/react` Inbox with Bell, Notifications, InboxContent, Preferences; tabs, filters, localization, snooze; headless hooks in `@novu/react` / `@novu/js`; React 18+ required (19 supported). [docs](https://docs.novu.co/platform/inbox/overview)
- Push: Push Webhook provider (send to a URL you control) [docs](https://docs.novu.co/platform/integrations/push/push-webhook); Pushpad provider for web push [docs](https://docs.novu.co/platform/integrations/push/pushpad); push overview [docs](https://docs.novu.co/platform/integrations/push).
- Idempotency: `Idempotency-Key` header: duplicates return cached response and count as one run; concurrent duplicates get 409; requires organization enablement via support. `transactionId` is for tracing/cancellation, not reliable dedupe. 429 with `Retry-After` and `RateLimit-*` headers. [API ref](https://docs.novu.co/api-reference/events/trigger-event)
- Compliance: SOC 2 Type II, HIPAA, ISO 27001:2013, GDPR; data centers US and Germany per security page; pricing page lists residency US, EU, SG, UK, AU, JP, KR (some Enterprise). [security](https://novu.co/security)
- Preferences: Inbox includes a Preferences component. [docs](https://docs.novu.co/platform/inbox/overview)

### Courier
- Pricing: Developer free (10,000 sends/mo; a send = one template to one recipient regardless of channels); Business $0.005 per send; Enterprise custom (SLA, RBAC). EU data residency is a Business option. No per-seat or per-channel fees. [pricing](https://www.courier.com/pricing)
- React: Inbox, Toasts, Preference Center; SDKs for React 18+, React 17, Vue, Angular, Web Components, mobile. Auth via backend-generated JWT and `signIn()`. Read/opened/archived state syncs across devices. [docs](https://www.courier.com/docs/platform/inbox/inbox-overview)
- Push: many providers (APNs, FCM, Expo, OneSignal, Airship, SNS, Pusher Beams, MagicBell, others) per [docs](https://www.courier.com/docs/integrations/push/overview) (via search-result summary). A native browser web push channel was not confirmed.
- Idempotency: `Idempotency-Key` returns stored response including errors; default validity 25 hours, extendable to 1 year via `x-idempotency-expiration`. [API ref](https://www.courier.com/docs/api-reference/send/send-a-message)
- SLA: Enterprise SLA only per pricing page. SOC 2 and GDPR not verified.

### MagicBell
- Pricing: Builder free (1,000 deliveries/mo, 1 project); Startup $249/mo (50,000 deliveries then $0.0025 each; 5 projects, extra $99 each); Enterprise custom. A delivery is counted per channel per user. [pricing](https://www.magicbell.com/pricing)
- SLA: not specified for Free/Startup on the pricing page.
- React: `@magicbell/react` (Provider, FloatingInbox, Inbox); Preact and Web Components libraries also exist. [docs](https://www.magicbell.com/docs/libraries/magicbell-react)
- Web push: out of the box on Chrome, Firefox, Safari; service worker imports a MagicBell script; `@magicbell/webpush` package. [docs](https://magicbell.com/docs/web-push)
- Channels: inbox, web push, mobile push, Slack, SMS, email. [pricing](https://www.magicbell.com/pricing)
- Compliance: GDPR, AES-256 encryption, pen testing; no SOC 2 claim on trust page. [trust](https://www.magicbell.com/security)
- Idempotency: not found (REST reference redirects to a Postman doc, not reviewed).

### SuprSend
- Pricing: Free 10,000 notifications/mo (in-app feed with SuprSend branding); Essentials $100/mo billed annually, 50,000 then $2 per 1,000; Business $250/mo billed annually, 50,000 then $5 per 1,000; Enterprise and BYOC (beta) custom. 99.9% uptime on standard plans. [pricing](https://www.suprsend.com/pricing)
- Channels: email, SMS, WhatsApp, mobile push, web push, Slack, MS Teams, in-app, webhook. [pricing](https://www.suprsend.com/pricing)
- React: `@suprsend/react` drop-in and headless; signed JWT user tokens (older `@suprsend/react-inbox` deprecated). [docs](https://docs.suprsend.com/docs/inbox-react)
- Web push: service worker file importing SuprSend CDN script; VAPID key on Vendors page. [docs](https://docs.suprsend.com/docs/webpush)
- Idempotency and compliance: not found (reference and security URLs returned 404).

### OneSignal
- Pricing: Free; Growth from $19/mo; Professional and Enterprise custom annual. Free limits: email 10,000 sends/mo, mobile push and in-app unlimited to 1,000 MAU, web push max 10,000 subscribers per send. SLA Enterprise only. [pricing](https://onesignal.com/pricing)
- Web push: requires HTTPS, OneSignal service worker, single origin; no incognito subscriptions; one subscription per browser/device; iOS 16.4+ with extra steps; each subdomain is a separate origin. [docs](https://documentation.onesignal.com/docs/web-push-setup)
- Inbox: no persistent notification-center/inbox found on the pricing page or in searches; in-app messages are a separate feature. [in-app messages](https://documentation.onesignal.com/docs/in-app-messages)
- Email: supported via API (`email_subject` + `email_body`, or `template_id`); `include_aliases` targets up to 20,000 users per call. [API](https://documentation.onesignal.com/reference/create-message)
- Idempotency: not found on the page reviewed.

### Not researched
Customer.io, NotificationAPI, Airship, Pusher Beams, and Firebase directly.

## Cross-cutting facts
- Idempotency confirmed in docs: Knock (24h, trigger endpoint only), Novu (header, needs enablement), Courier (25h default, up to 1 year). Not confirmed: MagicBell, SuprSend, OneSignal.
- Compliance confirmed: Novu (SOC 2 Type II, ISO 27001, HIPAA, GDPR); MagicBell (GDPR); Knock (HIPAA on Enterprise). Others unverified.
- Stack fit: inbox SDKs are client-side React libraries; Courier, SuprSend and Novu docs describe server-generated JWT/HMAC tokens for the browser. Triggers are HTTP APIs/SDKs callable from Node. No reviewed page mentions SQLite or React Router specifically (Knock's React docs excerpt explicitly did not address React Router/Remix).
- Self-hosting: Novu (open source; Enterprise self-hosted listed); SuprSend BYOC (beta).

## Gaps
Knock idempotence page, Knock and SuprSend security pages, SuprSend trigger reference, and MagicBell REST reference returned 404 or were not reviewed. SLA credit terms, provider-failure retry/backoff behaviour, and preference models for MagicBell, SuprSend and OneSignal not verified.
