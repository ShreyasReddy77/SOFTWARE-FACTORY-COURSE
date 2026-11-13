import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { coupons, notificationOutbox, purchases } from "~/db/schema";

type Db = BetterSQLite3Database<typeof schema>;

export const DELETED_USER_NAME = "Deleted user";

/**
 * Deletion-request support (docs/deletion-runbook.md, step 2).
 *
 * Deletes every outbox row addressed to the user, and scrubs the user's name
 * from rows addressed to other people (a Platform Admin's awaiting-review row
 * carries `buyerName`; a Team Admin's seat-claimed row carries `claimerName`).
 */
export function purgeUserOutbox(db: Db, userId: number) {
  return db.transaction((tx) => {
    const deleted = tx
      .delete(notificationOutbox)
      .where(eq(notificationOutbox.recipientUserId, userId))
      .run().changes;

    let scrubbed = 0;
    for (const row of tx.select().from(notificationOutbox).all()) {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(row.payload);
      } catch {
        continue;
      }

      let changed = false;
      if (typeof payload.purchaseId === "number" && "buyerName" in payload) {
        const purchase = tx
          .select({ userId: purchases.userId })
          .from(purchases)
          .where(eq(purchases.id, payload.purchaseId))
          .get();
        if (purchase?.userId === userId) {
          payload.buyerName = DELETED_USER_NAME;
          changed = true;
        }
      }
      if (typeof payload.couponId === "number" && "claimerName" in payload) {
        const coupon = tx
          .select({ redeemedByUserId: coupons.redeemedByUserId })
          .from(coupons)
          .where(eq(coupons.id, payload.couponId))
          .get();
        if (coupon?.redeemedByUserId === userId) {
          payload.claimerName = DELETED_USER_NAME;
          changed = true;
        }
      }

      if (changed) {
        tx.update(notificationOutbox)
          .set({ payload: JSON.stringify(payload) })
          .where(eq(notificationOutbox.id, row.id))
          .run();
        scrubbed++;
      }
    }

    return { deleted, scrubbed };
  });
}
