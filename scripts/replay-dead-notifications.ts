import { db } from "../app/db";
import { replayDeadRows } from "../app/lib/notifications.server";

// Puts every dead Notification back in the outbox so the worker retries it
// from the first attempt, with the same idempotency key. Run it once the cause
// (bad template, wrong credentials) is fixed.
const count = replayDeadRows(db);
console.log(JSON.stringify({ event: "notification_replay", replayed: count }));
