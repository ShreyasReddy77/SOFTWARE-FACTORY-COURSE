# Web Push feasibility for Cadence (web-only, no mobile app)

Date: 2026-11-13. Facts only, no decision. Question: issue #4.
Each claim cites the primary source it was read from. Items marked **[not verified]** could not be confirmed from a primary source during this pass.

## 1. Browser support

- Push API is "Baseline: widely available" across browsers since March 2023. Source: [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [MDN PushEvent](https://developer.mozilla.org/en-US/docs/Web/API/PushEvent).
- Safari on macOS supports Web Push from Safari 16.1 (macOS Ventura), uses a user-gesture permission prompt, needs no Apple Developer Program membership, and delivers even when Safari is not running. Source: [WebKit, Safari 16.1 features](https://webkit.org/blog/12824/news-from-wwdc-webkit-features-in-safari-16-1/).
- Safari's push uses Apple's push service; servers that restrict outbound hosts should allow any subdomain of `push.apple.com`. Source: same WebKit post.
- Chrome and Edge require `userVisibleOnly: true` and an `applicationServerKey` (VAPID public key, ECDSA P-256) in `PushManager.subscribe()`. Source: [MDN PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe).
- Firefox enforces a user-gesture requirement for subscribe since Firefox 72; it also applies a quota to push messages that do not result in a shown notification (reset per site visit). Chrome has no such message limit. Source: MDN subscribe and MDN Push API pages above.
- Secure context (HTTPS) is required for `PushManager.subscribe()`, `Notification.requestPermission()` and `PushEvent`. Source: MDN pages above, [MDN Notification.requestPermission](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static).

## 2. iOS / iPadOS constraints

- Web Push on iOS/iPadOS arrived in 16.4 and is specified for **Home Screen web apps** ("we are adding support for Web Push to Home Screen web apps"). Source: [WebKit, Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- A site counts as a web app only if it has a manifest with `display` set to `standalone` or `fullscreen`. Source: same post.
- Permission can only be requested in response to direct user interaction (e.g. tapping a "subscribe" button). Source: same post.
- It is built from Push API + Notifications API + Service Workers, delivered through the same Apple Push Notification service as native push. Notifications behave like native app notifications and integrate with Focus. Source: same post.
- Users install via Share button -> "Add to Home Screen". The post describes no install prompt, and notes a user can install multiple copies of a web app. Source: same post.
- The post does not explicitly say push is unavailable in a normal Safari tab; it says support is for Home Screen web apps. Apple's own doc page ([Sending web push notifications in web apps and browsers](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)) is JavaScript-rendered and could not be read. **[not verified: exact wording on in-tab Safari on iOS, subscription expiry/revocation, silent-push prohibition]**
- Since iOS 16.4 the Share-menu "Add to Home Screen" is available in Safari, Chrome, Edge, Firefox and Orion. Source: [MDN Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
- **[not verified]** EU-specific iOS behaviour for Home Screen web apps was not checked.

## 3. Permission prompt UX and opt-in rates

- `Notification.requestPermission()` must be called from a user interaction. Values: `granted`, `denied`, `default` (treated as denied). Once denied, the browser does not re-prompt; dismissal and explicit denial are not distinguished in the returned value per MDN's description. Cross-origin iframes can no longer request it in Chrome and Firefox. Source: [MDN requestPermission](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static).
- Chrome telemetry (reported via a search-result summary of the Chrome research; the primary pages did not load): notifications are about 74% of permission prompts but the least granted, about 12% grant on desktop and 23% on Android. Chrome 80+ shows a quieter UI to users who repeatedly deny and to sites with very low acceptance rates. Primary sources to confirm: [Chromium Blog, quieter permission UI](https://blog.chromium.org/2020/01/introducing-quieter-permission-ui-for.html) and [Bilogrevic et al., USENIX Security 2021](https://www.usenix.org/conference/usenixsecurity21/presentation/bilogrevic). **[numbers not verified against primary text]**
- web.dev guidance: request permission from a clear user gesture such as a confirmation button, followed by the browser's system dialog, which varies by platform. Source: [web.dev push overview](https://web.dev/articles/push-notifications-overview).
- No opt-in rate specific to a productivity/habit app was found in a primary source.

## 4. Service worker requirements

- An active service worker is mandatory to receive push; it is started on demand to handle the `push` event. Source: MDN Push API.
- Service workers need HTTPS (localhost excepted), are registered with a script path and scope (default: script's directory; widened only via `Service-Worker-Allowed`), and are terminated when idle; `event.waitUntil()` keeps them alive for async work. Source: [MDN Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
- Chrome/Edge require `userVisibleOnly: true`, i.e. each push is expected to result in a visible notification. Source: MDN subscribe. The PushEvent example shows the handler checking `Notification.permission` and showing a notification. Source: MDN PushEvent.
- MDN warns developers to apply CSRF protections around subscription endpoints, and that the subscription endpoint URL is a capability URL that must be kept secret. Source: MDN Push API.
- Server side: VAPID key pair; requests signed with the private key; payloads must be encrypted with keys from the `PushSubscription`; each browser vendor runs its own push service and the endpoint comes from the subscription. Source: web.dev push overview.

## 5. Delivery reliability

- RFC 8030: delivery is **not guaranteed**. A mandatory `TTL` header sets retention; after TTL expiry the push service MUST NOT deliver; the push service may use a shorter TTL than requested. TTL 0 messages are delivered only if the user agent is reachable at that moment. Offline user agents get queued messages on reconnect (within TTL). Source: [RFC 8030](https://www.rfc-editor.org/rfc/rfc8030).
- `Urgency` (very-low/low/normal/high) and `Topic` (new message replaces outstanding message with same topic) are supported. Source: RFC 8030.
- Optional delivery receipts exist (`Prefer: respond-async`, 202 + receipt URI, 204 on acknowledgement). Source: RFC 8030. web.dev notes no general delivery confirmation exists in practice. Source: web.dev push overview.
- Safari on macOS delivers when the browser is closed (see section 1). iOS notifications follow Focus modes set by the user. Sources: WebKit posts.
- No primary-source figures on real-world delivery rates were found. **[not verified]** Behaviour with OS battery savers or user-revoked permissions is not covered above.

## 6. What a PWA would require of Cadence

- Served over HTTPS. Source: MDN Making PWAs installable.
- Web app manifest linked from pages. Chromium installability needs `name` or `short_name`, `icons` (192px and 512px), `start_url`, `display` (or `display_override`), and `prefer_related_applications` absent/false. Chrome additionally describes engagement heuristics (a click/tap and 30 seconds viewing). Sources: MDN Making PWAs installable, [web.dev install criteria](https://web.dev/articles/install-criteria).
- iOS needs `display: standalone` or `fullscreen` in the manifest for Web Push. Source: WebKit iOS post.
- Safari on macOS Sonoma 17+ can "Add to Dock" with or without a manifest; Firefox desktop has no manifest-based PWA installation. Source: MDN Making PWAs installable.
- Service worker with a `push` handler (and `notificationclick` handling), a subscription flow triggered from a user gesture, and server storage and sending of `PushSubscription` objects with VAPID and payload encryption. Sources: section 4 above.

## 7. Email as the off-site channel (comparison facts)

- Email needs no browser permission prompt, service worker or install step. (Structural fact; contrast with sections 2-4.)
- Gmail's sender rules apply fully above 5,000 messages/day to Gmail accounts: SPF and DKIM, DMARC (policy may be `none`), valid forward/reverse DNS, TLS, one-click unsubscribe via `List-Unsubscribe` and `List-Unsubscribe-Post` headers for marketing/subscribed messages, spam rate kept under 0.30% (target under 0.10%). Effective 1 Feb 2024. Non-compliance may cause delays or spam classification. Source: [Google Workspace Admin Help, email sender guidelines](https://support.google.com/a/answer/81126).
- Email delivery has no standardised guarantee either; no primary-source delivery-rate figures were gathered. **[not verified]**
- Email open/click rates and deliverability for transactional reminders were not researched.

## 8. Open items that could not be verified from primary sources

1. Apple developer documentation text (page requires JavaScript).
2. Chromium blog / USENIX paper text for exact grant-rate figures.
3. Firefox permission-prompt behaviour (support.mozilla.org page failed to load).
4. Per-browser compatibility table detail for Firefox Android and iOS third-party browsers.
