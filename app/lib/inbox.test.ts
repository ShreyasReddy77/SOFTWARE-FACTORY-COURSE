import { describe, it, expect } from "vitest";
import {
  digestEventCount,
  groupByDay,
  notificationKind,
  PREFERENCE_TYPES,
} from "./inbox";

describe("digestEventCount", () => {
  it("reads the eventCount field the Novu in-app step sets", () => {
    expect(digestEventCount({ eventCount: 4 })).toBe(4);
  });
  it("is 0 when absent or not a number", () => {
    expect(digestEventCount(undefined)).toBe(0);
    expect(digestEventCount({ eventCount: "4" })).toBe(0);
  });
});

describe("groupByDay", () => {
  const now = new Date(2026, 2, 10, 15, 0, 0);
  const at = (d: number, h: number) => ({
    createdAt: new Date(2026, 2, d, h).toISOString(),
  });

  it("buckets into Today, Yesterday and Earlier, in that order", () => {
    const groups = groupByDay([at(10, 9), at(9, 23), at(3, 12), at(10, 1)], now);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Earlier", 1],
    ]);
  });

  it("omits empty groups", () => {
    expect(groupByDay([at(3, 12)], now).map((g) => g.label)).toEqual(["Earlier"]);
  });
});

describe("notificationKind", () => {
  it("colours refunds as money", () => {
    expect(notificationKind({ workflowId: "refund-approved" })).toBe("money");
  });
  it("colours Enrollment and Seat events as access", () => {
    expect(notificationKind({ workflowId: "seat-claimed" })).toBe("access");
    expect(notificationKind({ workflowId: "enrollment-ended" })).toBe("access");
  });
  it("defaults to activity", () => {
    expect(notificationKind({ workflowId: "comment-reply" })).toBe("activity");
    expect(notificationKind({})).toBe("activity");
  });
  it("lets a tag override the workflow", () => {
    expect(notificationKind({ workflowId: "x", tags: ["money"] })).toBe("money");
  });
});

describe("PREFERENCE_TYPES", () => {
  it("locks Transactional email and leaves Activity email toggleable", () => {
    for (const t of PREFERENCE_TYPES) {
      expect(t.emailLocked).toBe(t.mailClass === "transactional");
    }
    expect(PREFERENCE_TYPES.some((t) => t.mailClass === "activity")).toBe(true);
  });
});
