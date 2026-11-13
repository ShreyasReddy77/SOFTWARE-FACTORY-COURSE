// Pure helpers for the Inbox page. No Novu imports, so they are easy to test.

export type NotificationKind = "money" | "access" | "activity";

const KINDS: readonly NotificationKind[] = ["money", "access", "activity"];

/** Money amber, access blue, activity grey. A workflow tag wins over the id. */
export function notificationKind(input: {
  workflowId?: string;
  tags?: string[];
}): NotificationKind {
  const tagged = input.tags?.find((t): t is NotificationKind =>
    (KINDS as readonly string[]).includes(t)
  );
  if (tagged) return tagged;
  const id = input.workflowId ?? "";
  if (id.startsWith("refund-")) return "money";
  if (id === "seat-claimed" || id === "enrollment-ended" || id === "welcome") {
    return "access";
  }
  return "activity";
}

export type DayGroup<T> = { label: "Today" | "Yesterday" | "Earlier"; items: T[] };

export function groupByDay<T extends { createdAt: string }>(
  items: T[],
  now = new Date()
): DayGroup<T>[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const groups: DayGroup<T>[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ];
  for (const item of items) {
    const created = new Date(item.createdAt);
    const index = created >= startOfToday ? 0 : created >= startOfYesterday ? 1 : 2;
    groups[index].items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}

export type PreferenceType = {
  /** Novu workflow identifier. */
  workflowId: string;
  label: string;
  mailClass: "transactional" | "activity";
  /** Transactional email cannot be muted. In-app is always locked on. */
  emailLocked: boolean;
};

function type(
  workflowId: string,
  label: string,
  mailClass: PreferenceType["mailClass"]
): PreferenceType {
  return { workflowId, label, mailClass, emailLocked: mailClass === "transactional" };
}

// The shipped types from the spec catalogue (#16). Types 6 and 7 (Refund
// issued / failed) are added when a payment integration exists.
export const PREFERENCE_TYPES: PreferenceType[] = [
  type("refund-requested", "Refund requested (receipt)", "transactional"),
  type("refund-awaiting-review", "Refund request awaiting review", "transactional"),
  type("refund-approved", "Refund approved", "transactional"),
  type("refund-declined", "Refund declined", "transactional"),
  type("enrollment-ended", "Enrollment ended", "transactional"),
  type("welcome", "Welcome to a course", "transactional"),
  type("seat-claimed", "Seat claimed", "transactional"),
  type("new-enrollment", "New Enrollment on your course", "activity"),
  type("new-comment", "New comment on your course", "activity"),
  type("comment-reply", "Reply to your comment", "activity"),
  type("new-rating", "New course rating", "activity"),
];
