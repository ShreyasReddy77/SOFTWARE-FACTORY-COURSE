# Runbook: deleting a person's notification data

Owner: Platform Admin. Deadline: 30 days from the request. Keep a dated note of each step in the request ticket.

Cadence has no account-deletion feature; this runbook covers notification data in Novu, our outbox and Postmark.

1. **Verify the requester.** Confirm the request comes from the email on the account. Find their Cadence user id (`/admin/users`).
2. **Delete the Novu subscriber.** Novu dashboard (US region) > Subscribers > search by id (the Cadence user id as a string) > Delete. This removes inbox items, read state, preferences and delivery history held by Novu.
3. **Anonymise or purge the outbox.** Run `npm run purge-user-outbox -- <userId>` against the production database. It deletes every outbox row addressed to the user (pending, sent or dead) and replaces the user's name with "Deleted user" in rows addressed to others (`buyerName`, `claimerName`). It prints `{"deleted": n, "scrubbed": m}`; record that.
4. **Postmark.** Do nothing: message content expires on Postmark's 45-day default (no Retention add-on). Whether Postmark can delete individual messages earlier is unverified and this runbook does not depend on it.
5. **Remaining data.** Only the Postmark bounce/complaint suppression entry may remain (an email address, kept so we do not email again). The privacy notice (`/privacy`) discloses this.
6. **Reply to the requester** within 30 days, stating what was deleted and what expires on its own (Postmark content within 45 days of the last send).

Order matters: delete the Novu subscriber and purge the outbox before any further activity can re-create them. If the user's account still exists, new activity will create a new subscriber; deactivate or remove the account by other means first.
