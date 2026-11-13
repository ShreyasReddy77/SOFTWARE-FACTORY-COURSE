import { db } from "~/db";
import { drainOutbox, notificationsEnabled } from "./notifications.server";

// In-process outbox worker. Started once per server process (the globalThis
// flag survives HMR module reloads) and only when NOTIFICATIONS_ENABLED.
const DRAIN_INTERVAL_MS = 15_000;

const globalForWorker = globalThis as unknown as {
  __notificationWorker?: ReturnType<typeof setInterval>;
};

/** Fire and forget: Novu latency never sits in a request. */
export function drainInBackground() {
  if (!notificationsEnabled()) return;
  drainOutbox(db).catch((error) => {
    console.error(
      JSON.stringify({
        event: "notification_drain_failed",
        error: error instanceof Error ? error.message : String(error),
      })
    );
  });
}

/** Safe to call on every request; starts the interval at most once. */
export function ensureNotificationWorker() {
  if (globalForWorker.__notificationWorker || !notificationsEnabled()) return;
  const timer = setInterval(drainInBackground, DRAIN_INTERVAL_MS);
  timer.unref();
  globalForWorker.__notificationWorker = timer;
  drainInBackground();
}
