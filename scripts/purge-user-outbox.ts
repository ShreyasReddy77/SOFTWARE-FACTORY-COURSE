import { db } from "../app/db";
import { purgeUserOutbox } from "../app/lib/outbox-purge.server";

// Usage: npm run purge-user-outbox -- <userId>
// Step 2 of docs/deletion-runbook.md.
const userId = Number(process.argv[2]);
if (!Number.isInteger(userId) || userId <= 0) {
  console.error("Usage: npm run purge-user-outbox -- <userId>");
  process.exit(1);
}

const result = purgeUserOutbox(db, userId);
console.log(JSON.stringify({ event: "outbox_purge", userId, ...result }));
