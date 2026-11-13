import { useCounts } from "@novu/react";

/** Unread count for the sidebar. Must render inside <NovuProvider>. */
export function InboxBadge() {
  const { counts } = useCounts({ filters: [{ read: false }] });
  const unread = counts?.[0]?.count ?? 0;
  if (unread === 0) return null;

  return (
    <span
      aria-label={`${unread} unread`}
      className="ml-auto flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}
