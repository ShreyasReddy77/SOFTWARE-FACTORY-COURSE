import { useState } from "react";
import { useNavigate } from "react-router";
import {
  useCounts,
  useNotifications,
  useNovu,
  usePreferences,
} from "@novu/react";
import type { Notification, Preference } from "@novu/js";
import { Lock } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  digestEventCount,
  groupByDay,
  notificationKind,
  PREFERENCE_TYPES,
  type NotificationKind,
} from "~/lib/inbox";
import { cn, formatRelativeTime } from "~/lib/utils";

const kindDot: Record<NotificationKind, string> = {
  money: "bg-amber-500",
  access: "bg-blue-500",
  activity: "bg-muted-foreground/40",
};

function eventCount(notification: Notification): number {
  return digestEventCount(notification.data);
}

function NotificationRow({ notification }: { notification: Notification }) {
  const navigate = useNavigate();
  const kind = notificationKind({
    workflowId: notification.workflow?.identifier,
    tags: notification.tags,
  });
  const count = eventCount(notification);

  function open() {
    void notification.read();
    const url = notification.redirect?.url;
    if (!url) return;
    if (url.startsWith("/")) void navigate(url);
    else window.location.assign(url);
  }

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={open}
        className={cn(
          "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
          !notification.isRead && "bg-primary/5"
        )}
      >
        <span
          aria-label={notification.isRead ? undefined : "Unread"}
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            notification.isRead ? "bg-transparent" : kindDot[kind]
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={cn(
                "text-sm",
                notification.isRead ? "font-medium" : "font-semibold"
              )}
            >
              {notification.subject ?? notification.body}
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatRelativeTime(notification.createdAt)}
            </span>
          </div>
          {notification.subject && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {notification.body}
            </p>
          )}
        </div>
      </button>
      {count > 1 && (
        <div className="bg-muted/40 px-9 py-1 text-xs text-muted-foreground">
          Grouped · {count} events in the last hour
        </div>
      )}
    </div>
  );
}

function EmptyState({ unreadOnly }: { unreadOnly: boolean }) {
  return (
    <div className="mt-6 rounded-lg border border-dashed p-10 text-center">
      <p className="font-medium">
        {unreadOnly ? "You're all caught up" : "Nothing here yet"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Refund updates, new Enrollments, Seats being claimed and replies to your
        comments will appear here.
      </p>
    </div>
  );
}

function NotificationList({ unreadOnly }: { unreadOnly: boolean }) {
  const { notifications, isLoading, hasMore, fetchMore, error } =
    useNotifications(unreadOnly ? { read: false } : {});

  if (error) {
    return (
      <p className="mt-6 text-sm text-destructive">
        Couldn't load your Notifications. Try refreshing the page.
      </p>
    );
  }
  if (isLoading || !notifications) {
    return (
      <div className="mt-6 space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (notifications.length === 0) return <EmptyState unreadOnly={unreadOnly} />;

  return (
    <div>
      {groupByDay(notifications).map((group) => (
        <section key={group.label} className="mt-6">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </h2>
          <div className="overflow-hidden rounded-lg border">
            {group.items.map((n) => (
              <NotificationRow key={n.id} notification={n} />
            ))}
          </div>
        </section>
      ))}
      {hasMore && (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => void fetchMore()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}

function PreferenceRow({
  label,
  locked,
  preference,
}: {
  label: string;
  locked: boolean;
  preference: Preference | undefined;
}) {
  const [saving, setSaving] = useState(false);
  const emailOn = locked || (preference?.channels.email ?? true);

  async function toggle() {
    if (!preference) return;
    setSaving(true);
    await preference.update({ channels: { email: !emailOn } });
    setSaving(false);
  }

  return (
    <div className="grid grid-cols-[1fr_88px_88px] items-center border-b px-4 py-3 text-sm last:border-b-0">
      <span>{label}</span>
      <span
        className="flex items-center justify-center gap-1 text-muted-foreground"
        title="In-app is always on"
      >
        <Lock className="size-3" />
        On
      </span>
      {locked ? (
        <span
          className="flex items-center justify-center gap-1 text-muted-foreground"
          title="Required message about your account or purchase"
        >
          <Lock className="size-3" />
          On
        </span>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={emailOn}
          aria-label={`Email for ${label}`}
          disabled={!preference || saving}
          onClick={() => void toggle()}
          className={cn(
            "mx-auto h-5 w-9 rounded-full p-0.5 transition-colors disabled:opacity-50",
            emailOn ? "bg-primary" : "bg-muted-foreground/30"
          )}
        >
          <span
            className={cn(
              "block size-4 rounded-full bg-background transition-transform",
              emailOn && "translate-x-4"
            )}
          />
        </button>
      )}
    </div>
  );
}

function PreferencesPanel() {
  const { preferences, isLoading } = usePreferences();
  if (isLoading) return <Skeleton className="mt-6 h-48 w-full" />;

  const byWorkflow = new Map(
    (preferences ?? []).map((p) => [p.workflow?.identifier, p])
  );

  return (
    <div className="mt-6 overflow-hidden rounded-lg border">
      <div className="grid grid-cols-[1fr_88px_88px] border-b bg-muted/50 px-4 py-2 text-xs font-semibold">
        <span>Type</span>
        <span className="text-center">In-app</span>
        <span className="text-center">Email</span>
      </div>
      {PREFERENCE_TYPES.map((t) => (
        <PreferenceRow
          key={t.workflowId}
          label={t.label}
          locked={t.emailLocked}
          preference={byWorkflow.get(t.workflowId)}
        />
      ))}
      <p className="px-4 py-3 text-xs text-muted-foreground">
        In-app Notifications can't be turned off. Email about your account or
        purchases is required. Activity mail can be turned off per type, and
        every Activity email has a one-click unsubscribe.
      </p>
    </div>
  );
}

export function InboxView() {
  const novu = useNovu();
  const { counts } = useCounts({ filters: [{ read: false }] });
  const unread = counts?.[0]?.count ?? 0;

  return (
    <Tabs defaultValue="all">
      <div className="flex items-end justify-between">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread ({unread})</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>
        <Button
          variant="ghost"
          size="sm"
          disabled={unread === 0}
          onClick={() => void novu.notifications.readAll()}
        >
          Mark all read
        </Button>
      </div>
      <TabsContent value="all">
        <NotificationList unreadOnly={false} />
      </TabsContent>
      <TabsContent value="unread">
        <NotificationList unreadOnly />
      </TabsContent>
      <TabsContent value="preferences">
        <PreferencesPanel />
      </TabsContent>
    </Tabs>
  );
}
