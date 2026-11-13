import { Form, Link, data } from "react-router";
import type { Route } from "./+types/unsubscribe.$token";
import {
  unsubscribeFromActivityType,
  verifyUnsubscribeToken,
} from "~/lib/unsubscribe.server";
import { Button } from "~/components/ui/button";

// Works without login: the signed token names the user and one Activity type.
// GET only shows a confirmation (link scanners prefetch GETs); POST does it,
// which is also what mail clients send for List-Unsubscribe-Post (RFC 8058).

export function meta() {
  return [{ title: "Unsubscribe — Cadence" }];
}

const NOT_CONFIGURED = "Unsubscribe is not configured";

function checkToken(token: string) {
  const secret = process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET;
  if (!secret) throw data(NOT_CONFIGURED, { status: 503 });
  const verified = verifyUnsubscribeToken(secret, token);
  if (!verified) throw data("This unsubscribe link is not valid", { status: 400 });
  return verified;
}

export async function loader({ params }: Route.LoaderArgs) {
  const { activityType } = checkToken(params.token);
  return { activityType };
}

export async function action({ params }: Route.ActionArgs) {
  const { userId, activityType } = checkToken(params.token);
  const secretKey = process.env.NOVU_SECRET_KEY;
  if (!secretKey) throw data(NOT_CONFIGURED, { status: 503 });
  try {
    await unsubscribeFromActivityType({ secretKey, userId, activityType });
  } catch {
    throw data("Could not update your preferences. Try again later.", {
      status: 502,
    });
  }
  return { done: true, activityType };
}

export default function Unsubscribe({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Unsubscribe</h1>
      {actionData?.done ? (
        <p>
          Done. You will no longer get &quot;{loaderData.activityType}&quot;
          emails. You can change this any time in{" "}
          <Link to="/inbox" className="underline">
            Preferences
          </Link>
          .
        </p>
      ) : (
        <Form method="post" className="space-y-3">
          <p>
            Turn off &quot;{loaderData.activityType}&quot; emails? Other
            Notifications are not affected.
          </p>
          <Button type="submit">Unsubscribe</Button>
        </Form>
      )}
    </div>
  );
}
