import { Link } from "react-router";

/** Shown at signup and checkout. Informs; there is no consent checkbox. */
export function EmailNotice({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-sm text-muted-foreground"}>
      We will email you about your purchases and activity on your courses.
      Manage this in{" "}
      <Link to="/inbox" className="underline">
        Preferences
      </Link>
      .{" "}
      <Link to="/privacy" className="underline">
        Privacy notice
      </Link>
      .
    </p>
  );
}
