import { data } from "react-router";
import type { Route } from "./+types/inbox";
import { getCurrentUserId } from "~/lib/session";
import { getInboxConfig } from "~/lib/novu-inbox.server";
import { InboxView } from "~/components/inbox-view";

export function meta() {
  return [
    { title: "Inbox — Cadence" },
    { name: "description", content: "Your Notifications and preferences" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to see your Inbox.", {
      status: 401,
    });
  }
  // The NovuProvider lives in the app layout; this only says whether it is there.
  return { available: getInboxConfig(currentUserId) !== null };
}

export default function InboxPage({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <h1 className="mb-6 text-2xl font-bold">Inbox</h1>
      {loaderData.available ? (
        <InboxView />
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">The Inbox is unavailable right now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Notifications are not set up in this environment. Nothing is lost:
            they will appear here once the Inbox is connected.
          </p>
        </div>
      )}
    </div>
  );
}
