import { Link } from "react-router";
import type { Route } from "./+types/privacy";
import { getPostalAddress, getPrivacyContactEmail } from "~/lib/compliance.server";

export function meta() {
  return [{ title: "Privacy notice — Cadence" }];
}

export async function loader() {
  return {
    postalAddress: getPostalAddress(),
    contactEmail: getPrivacyContactEmail(),
  };
}

export default function Privacy({ loaderData }: Route.ComponentProps) {
  const { postalAddress, contactEmail } = loaderData;
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Link to="/" className="text-2xl font-bold tracking-tight">
        Cadence
      </Link>
      <h1 className="text-2xl font-semibold">Privacy notice</h1>
      <p>
        This notice explains how Cadence uses your personal data when it sends
        you Notifications in the app and by email.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Data we use</h2>
        <ul className="list-disc pl-6">
          <li>Your name and email address.</li>
          <li>The titles of courses you buy, join or teach.</li>
          <li>The note a Platform Admin writes when declining a refund request.</li>
          <li>The text of comments you post or that are posted on your courses.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Why, and our legal basis</h2>
        <ul className="list-disc pl-6">
          <li>
            Required messages about your account or purchase (receipts, refund
            decisions, enrolment and seat messages): contract. These cannot be
            turned off.
          </li>
          <li>
            Activity email (new enrolments, comments, replies and ratings on
            your courses): legitimate interest in keeping you informed. You can
            turn each type off in Preferences, or with the unsubscribe link in
            every Activity email.
          </li>
          <li>
            Notifications shown inside Cadence are always on, because they are
            the record of what happened on your account.
          </li>
        </ul>
        <p>We send no marketing email.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Who processes it</h2>
        <ul className="list-disc pl-6">
          <li>Novu (United States): delivers and stores Notifications and your preferences.</li>
          <li>Postmark (United States): sends the email.</li>
        </ul>
        <p>
          Data is transferred to the United States under the EU-US Data Privacy
          Framework and Standard Contractual Clauses, as set out in our data
          processing agreements with both processors.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">How long we keep it</h2>
        <ul className="list-disc pl-6">
          <li>Cadence keeps queued notifications only until they are delivered, then prunes them.</li>
          <li>Novu keeps your in-app Notification history for the period of our Novu plan.</li>
          <li>Postmark keeps message content for 45 days, then it expires.</li>
          <li>
            Postmark keeps a suppression entry (your email address) if a
            message bounces or you report it as spam, so we do not email you
            again.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Your rights</h2>
        <p>
          You can ask to see, correct or delete your data, object to Activity
          email, or complain to your data protection authority. We act on
          deletion requests within 30 days. Contact us using the details below.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p>
          {contactEmail ? (
            <>
              Email <a className="underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>
              <br />
            </>
          ) : null}
          {postalAddress ? (
            <span className="whitespace-pre-line">{postalAddress}</span>
          ) : (
            <span>Postal address to be published.</span>
          )}
        </p>
      </section>

      <p>
        <Link to="/inbox" className="underline">
          Manage your Preferences
        </Link>
      </p>
    </div>
  );
}
