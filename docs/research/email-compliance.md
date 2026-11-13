# Privacy and compliance duties for Cadence notification email

Research date: 2026-11-13. Facts only; no recommendation, not legal advice. Answers GitHub issue #12 (parent map #2). Context: Cadence sells video courses to Students globally; stack is Novu (notifications) + Postmark (email); notification types are in issue #6.

Method note: pages were read with a summarising fetch tool (WebFetch), so wording is as relayed from the cited pages, not verbatim; short quotes are as relayed. Search-result snippets are marked "(search snippet)". Plan and policy pages change; re-check before relying.

## Answers

| Question | Answer |
|---|---|
| CAN-SPAM: do refund decisions, seat claimed, enrollment ended need an opt-out? | Not if they are "transactional or relationship messages" (16 CFR 316.3(c)): only accurate routing/header info is required. Whether each Cadence type fits a category is a classification call, see gaps |
| CAN-SPAM: welcome, comment replies, Instructor digests | Not clearly in a listed category; if "commercial" they need all requirements (opt-out honoured within 10 business days, physical address, etc.). Classification unresolved, see gaps |
| GDPR/ePrivacy: consent for non-essential email | ePrivacy Art. 13 is opt-in for unsolicited electronic mail marketing, with an existing-customer exception ("soft opt-in"); GDPR Art. 21(2)-(3) gives an absolute right to object to direct marketing |
| Gmail/Yahoo bulk sender rules | One-click unsubscribe applies to marketing and subscribed messages, not (per relayed text) transactional; authentication and spam-rate rules apply to bulk senders |
| Novu regions | US (Virginia) and EU (Frankfurt) on all plans; UK, Singapore, Australia, Japan, South Korea on Enterprise. Region fixed at account creation |
| Postmark regions | US only (Deft near Chicago, AWS); no EU hosting, none planned |
| DPAs | Both vendors offer a DPA acting as processor, with SCCs for transfers |

## CAN-SPAM (US)

- Applies to commercial messages; "transactional or relationship" messages facilitate agreed transactions or provide account updates. A message with only commercial content is commercial and must comply with all requirements. [FTC compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- Seven requirements for commercial mail: accurate header info, non-deceptive subject, ad identification, valid physical postal address, clear opt-out explanation, honour opt-out within 10 business days, remain responsible when a third party sends on your behalf. Penalty up to $53,088 per violating email. Transactional messages need only accurate routing information. [FTC guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- Statute: opt-out mechanism must work for at least 30 days after sending; sending a covered commercial message more than 10 business days after the request is unlawful; commercial mail needs a valid physical postal address. [15 U.S.C. 7704](https://www.law.cornell.edu/uscode/text/15/7704)
- Five transactional/relationship categories (16 CFR 316.3(c)): (1) facilitate, complete or confirm a commercial transaction the recipient agreed to; (2) warranty, recall, safety or security information; (3) subscription, membership or account notices about changes in terms/features, status changes, or periodic statements; (4) employment; (5) deliver goods or services the recipient is entitled to receive. [16 CFR 316.3 (Cornell LII)](https://www.law.cornell.edu/cfr/text/16/316.3)
- Mixed content: primary purpose is commercial if the subject line would lead a reasonable recipient to expect a commercial promotion, or if the transactional content does not appear at the beginning. [16 CFR 316.3(a)](https://www.law.cornell.edu/cfr/text/16/316.3)

## GDPR and ePrivacy (EU/EEA, plus UK equivalents)

- GDPR Art. 6(1) lawful bases include consent (a), contract performance (b) and legitimate interests (f). [Art. 6](https://gdpr-info.eu/art-6-gdpr/)
- GDPR Art. 21(2)-(4): right to object at any time to processing for direct marketing; after objection the data "shall no longer be processed for such purposes"; the right must be brought to the data subject's attention clearly and separately at first contact. [Art. 21](https://gdpr-info.eu/art-21-gdpr/)
- ePrivacy Directive 2002/58/EC Art. 13: unsolicited electronic mail for direct marketing needs prior consent, with an exception where a business obtained the customer's email "in the context of the sale of a product or a service" (soft opt-in). Only a search snippet was obtained; the primary text was not retrievable (see gaps). Official text: [EUR-Lex](https://eur-lex.europa.eu/eli/dir/2002/58/oj/eng), [legislation.gov.uk copy](https://www.legislation.gov.uk/eudr/2002/58/article/13).
- CJEU judgment of 13 Nov 2025 (search snippet via a law-firm summary): a free user account falls under "sale of a service" for Art. 13(2) where it is tied to a premium service. Not verified against the judgment: [law-firm summary](https://www.fgvw.de/en/news/data-protection-law-news-from-the-ecj-on-the-use-of-email-addresses-for-advertising-purposes), [CJEU press](https://curia.europa.eu/jcms/jcms/p1_3583635/en).
- No source read defines "transactional" mail under GDPR/ePrivacy; Art. 13 regulates direct marketing. Contract performance (Art. 6(1)(b)) is a listed lawful basis; no primary guidance read maps Cadence's types onto it.

## Gmail and Yahoo bulk sender rules

- Gmail: senders above 5,000 messages/day to Gmail accounts must authenticate (SPF, DKIM, DMARC), support one-click unsubscribe (`List-Unsubscribe-Post: List-Unsubscribe=One-Click`) with a visible body link for "marketing messages and subscribed messages", and keep Postmaster spam rate under 0.10%, never reaching 0.30%. [Google sender guidelines](https://support.google.com/a/answer/81126)
- Yahoo: all senders SPF or DKIM; bulk senders both plus DMARC; list-unsubscribe header with one-click for "marketing and subscribed messages"; honour unsubscribes within 2 days; spam rate below 0.3%. Page relayed no numeric bulk threshold. [Yahoo sender best practices](https://senders.yahooinc.com/best-practices/)

## Postmark

- Roles: AC PM LLC is processor/service provider; customer is controller/business. [Postmark DPA](https://postmarkapp.com/dpa)
- DPA: transfers under EU-U.S. Data Privacy Framework and SCCs (Module Two), UK Addendum, Brazil SCCs; Irish law and courts for SCCs; audits once a year absent concerns; new subprocessors notified with 7 days to object; customer data deleted within 30 days of account termination; breach notice "without undue delay". [DPA](https://postmarkapp.com/dpa) (last ~5,000 characters unread)
- Location and subprocessors: servers outside EU (Deft data centre near Chicago; AWS); "no plans to add servers in the EU". Subprocessors: Deft, AWS; Zendesk for support (not a delivery subprocessor). SOC 2 Type 2 at Deft. Data access requests answered within 14 days or less. [EU privacy page](https://postmarkapp.com/eu-privacy), [euprivacy](https://postmarkapp.com/euprivacy). These pages may be older than the DPA (which cites the DPF); check the current subprocessor list.
- Retention: message content and activity 45 days by default; Retention Add-on 7 to 365 days on paid plans; expired content queued for deletion; hard bounces and spam complaints kept indefinitely in Suppressions. [Retention add-on](https://postmarkapp.com/support/article/how-does-the-retention-add-on-work)
- Streams (search snippet): Broadcast streams require an unsubscribe link (auto-appended to the footer if no placeholder); Transactional streams do not require one but unsubscribe links work there. [why broadcasts require an unsubscribe link](https://postmarkapp.com/support/article/1217-why-broadcasts-require-an-unsubscribe-link), [adding an unsubscribe link](https://postmarkapp.com/support/article/1208-how-to-add-an-unsubscribe-link), [List-Unsubscribe header](https://postmarkapp.com/support/article/1299-how-to-include-a-list-unsubscribe-header)

## Novu

- Roles: Noti-Fire Apps Ltd. d/b/a Novu is processor; customer is controller. SCCs required for transfers out of the EEA; deletion/return/anonymisation within 60 days of service end; breach notice within 72 hours where feasible; audits at customer expense through mandated auditors. Subprocessors authorised, with 7 days' notice of new ones and a right to object; the DPA page names none. [Novu DPA](https://novu.co/dpa)
- Regions: US (Virginia), EU (Frankfurt), UK, Singapore, Australia, Japan, South Korea; Enterprise unlocks UK and APAC. Chosen at account creation; EU endpoints `https://eu.api.novu.co/v1`, `wss://eu.socket.novu.co`; API keys are region-bound (401 otherwise). [Novu security docs](https://docs.novu.co/platform/additional-resources/security.md)
- Certifications claimed: SOC 2 Type II, ISO 27001, HIPAA, GDPR; evidence at trust.novu.co (not fetched). [Novu security](https://novu.co/security/)
- Retention of activity and inbox data is plan-based (see [novu-delay-digest research](https://github.com/ShreyasReddy77/SOFTWARE-FACTORY-COURSE/blob/research/novu-delay-digest/docs/research/novu-delay-digest.md)).

## Student data in notification payloads

Derived from the notification table in issue #6 (a design inventory, not a vendor fact); no code audited:
- Always: Novu subscriber identity (id) and the email address Postmark needs to send; display name probably used in greetings.
- Refund types (1-7): Buyer/Admin identity, course title, refund status, Platform Admin's decline note (free text), amounts for issued/failed refunds.
- Enrollment ended / Welcome / Seat claimed: Student name, course title, Team Admin relation.
- Comment/reply/rating types (11-13): Student-authored free text, commenter name, course/lesson identifiers.
- Payload data is processed by Novu (activity feed per plan retention) and the rendered email by Postmark (45 days default), both as processors. The Novu docs fetched did not describe payload encryption.

## Gaps and conflicts

- ePrivacy Art. 13 primary text could not be fetched (EUR-Lex and legislation.gov.uk returned empty content; privacy-regulation.eu and the ICO PECR page returned 404); content is from a search snippet, unverified here. So the EU/UK line between service messages and marketing is not confirmed from a primary source, and the soft opt-in conditions (similar products, chance to object at collection and in each message) are not confirmed here.
- eCFR 16 CFR Part 316 redirected to a captcha; Cornell LII copy used.
- Whether welcome, comment-reply and digest emails are "commercial" under CAN-SPAM or "marketing" under ePrivacy is not answered by any source read; the FTC test turns on subject line, content placement and the five categories.
- The Gmail "transactional" treatment is inferred from the wording "marketing messages and subscribed messages"; an explicit exemption quote was not retrieved. How the 5,000/day threshold is counted was not read.
- Postmark `/sub-processors` and retention article 1196 returned 404; the euprivacy pages may predate the DPA; Postmark stream pages are search snippets only.
- Novu subprocessor list and trust.novu.co not fetched; the DPA lists none inline.
- Not covered: UK GDPR/PECR specifics, CASL (Canada), Australia Spam Act, other countries' rules for a global audience; children's data (GDPR Art. 8, COPPA); Student age is unknown.
- CAN-SPAM penalty figure ($53,088) is as stated on the FTC page; it is inflation-adjusted yearly.
