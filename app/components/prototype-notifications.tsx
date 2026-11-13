// PROTOTYPE — throwaway, never shipped. Question (wayfinder ticket "What do
// notifications look like in the Cadence app?"): where does the in-app inbox
// live and how does it read? Three variants on the existing app layout,
// switched with ?variant=A|B|C. Mock data only, in memory, no mutations.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Bell, Check, X, Mail, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { UserRole } from "~/db/schema";
import { cn } from "~/lib/utils";

type Kind = "money" | "access" | "activity";
type N = {
  id: number;
  type: string;
  kind: Kind;
  title: string;
  body: string;
  when: string;
  day: "Today" | "Yesterday" | "Earlier";
  unread: boolean;
  count?: number; // digest
  action?: string;
};

const MOCK: Record<string, N[]> = {
  student: [
    { id: 1, type: "Refund approved", kind: "money", title: "Refund approved — Advanced TypeScript", body: "You'll get back $79.00. Your Enrollment has ended; your progress is kept.", when: "12 min ago", day: "Today", unread: true, action: "View refund" },
    { id: 2, type: "Enrollment ended", kind: "access", title: "Your Enrollment on Advanced TypeScript has ended", body: "You can re-enrol any time; your 42% progress is saved.", when: "12 min ago", day: "Today", unread: true },
    { id: 3, type: "Reply to your comment", kind: "activity", title: "Sam replied to your comment", body: "“Lesson 4 — you can use satisfies there instead of a cast…”", when: "3 h ago", day: "Today", unread: true, action: "Open lesson" },
    { id: 4, type: "Welcome", kind: "activity", title: "Welcome to React Fundamentals", body: "Start with Module 1: Components.", when: "Yesterday", day: "Yesterday", unread: false, action: "Start course" },
    { id: 5, type: "Refund declined", kind: "money", title: "Refund declined — Intro to SQL", body: "Note from the team: you've watched more than the Watch Limit.", when: "Mar 3", day: "Earlier", unread: false },
  ],
  instructor: [
    { id: 1, type: "New comment", kind: "activity", title: "3 new comments on Advanced TypeScript", body: "Latest: “Is there a repo for lesson 6?”", when: "20 min ago", day: "Today", unread: true, count: 3, action: "Reply" },
    { id: 2, type: "New Enrollment", kind: "activity", title: "5 new Students enrolled on React Fundamentals", body: "Alex, Priya, Jo and 2 more", when: "1 h ago", day: "Today", unread: true, count: 5 },
    { id: 3, type: "New rating", kind: "activity", title: "New 5★ rating on React Fundamentals", body: "“Clear and well paced.”", when: "Yesterday", day: "Yesterday", unread: false },
    { id: 4, type: "New Enrollment", kind: "activity", title: "2 new Students enrolled on Intro to SQL", body: "Mia and Dev", when: "Mar 3", day: "Earlier", unread: false, count: 2 },
  ],
  admin: [
    { id: 1, type: "Refund request awaiting review", kind: "money", title: "Refund request awaiting review — Team Licence, 10 Seats", body: "Buyer: Acme Co. $790.00. Reason: “Bought for the wrong course.”", when: "4 min ago", day: "Today", unread: true, action: "Review" },
    { id: 2, type: "Refund request awaiting review", kind: "money", title: "Refund request awaiting review — Advanced TypeScript", body: "Buyer: Jordan. $79.00. 9 minutes Watched.", when: "2 h ago", day: "Today", unread: true, action: "Review" },
    { id: 3, type: "Refund failed", kind: "money", title: "Refund failed — React Fundamentals", body: "The money couldn't be sent. The Refund Request stays approved.", when: "Yesterday", day: "Yesterday", unread: false, action: "Retry" },
  ],
  teamadmin: [
    { id: 1, type: "Seat claimed", kind: "access", title: "Priya claimed a Seat on Advanced TypeScript", body: "7 of 10 Seats are now claimed.", when: "35 min ago", day: "Today", unread: true, action: "View Team" },
    { id: 2, type: "Refund declined", kind: "money", title: "Refund declined — Team Licence, React Fundamentals", body: "A Seat has been claimed, so the licence can't be refunded.", when: "Yesterday", day: "Yesterday", unread: false },
  ],
};

const VARIANTS = [
  ["A", "Bell popover"],
  ["B", "Inbox page + preferences"],
  ["C", "Drawer, toasts, grouped"],
] as const;

function Switcher({ current }: { current: string }) {
  const [, setParams] = useSearchParams();
  const idx = Math.max(0, VARIANTS.findIndex(([k]) => k === current));
  const go = (d: number) =>
    setParams(
      (p) => {
        p.set("variant", VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length][0]);
        return p;
      },
      { replace: true }
    );
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,[contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-4 py-2 text-sm text-white shadow-lg">
      <button onClick={() => go(-1)}><ChevronLeft className="size-4" /></button>
      <span>{VARIANTS[idx][0]} ({VARIANTS[idx][1]})</span>
      <button onClick={() => go(1)}><ChevronRight className="size-4" /></button>
    </div>
  );
}

const kindDot: Record<Kind, string> = {
  money: "bg-amber-500",
  access: "bg-blue-500",
  activity: "bg-muted-foreground/40",
};

function Row({ n, onRead, compact }: { n: N; onRead: () => void; compact?: boolean }) {
  return (
    <div
      onClick={onRead}
      className={cn(
        "flex cursor-pointer gap-3 border-b px-4 py-3 hover:bg-muted/60",
        n.unread && "bg-primary/5"
      )}
    >
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.unread ? kindDot[n.kind] : "bg-transparent")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn("text-sm", n.unread ? "font-semibold" : "font-medium")}>{n.title}</p>
          <span className="shrink-0 text-xs text-muted-foreground">{n.when}</span>
        </div>
        {!compact && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
        {n.action && !compact && (
          <span className="mt-1 inline-block text-xs font-medium text-primary">{n.action} →</span>
        )}
      </div>
    </div>
  );
}

function useInbox(items: N[]) {
  const [list, setList] = useState(items);
  useEffect(() => setList(items), [items]);
  const read = (id: number) => setList((l) => l.map((n) => (n.id === id ? { ...n, unread: false } : n)));
  const readAll = () => setList((l) => l.map((n) => ({ ...n, unread: false })));
  return { list, read, readAll, unread: list.filter((n) => n.unread).length };
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
      {n}
    </span>
  );
}

// A: bell top-right of content, popover with recent 5, "see all" is out of scope.
function VariantA({ items }: { items: N[] }) {
  const { list, read, readAll, unread } = useInbox(items);
  const [open, setOpen] = useState(true);
  return (
    <div className="fixed right-6 top-3 z-50">
      <button onClick={() => setOpen(!open)} className="relative rounded-full border bg-background p-2 shadow">
        <Bell className="size-5" />
        <Badge n={unread} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-96 overflow-hidden rounded-lg border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <button onClick={readAll} className="text-xs text-primary">Mark all read</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.map((n) => <Row key={n.id} n={n} onRead={() => read(n.id)} />)}
          </div>
          <div className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
            In-app only · email settings in Settings
          </div>
        </div>
      )}
    </div>
  );
}

// B: a full inbox page (stand-in overlay over main) with tabs and per-type preferences.
function VariantB({ items }: { items: N[] }) {
  const { list, read, readAll, unread } = useInbox(items);
  const [tab, setTab] = useState<"all" | "unread" | "prefs">("all");
  const types = [...new Set(items.map((n) => n.type))];
  const [mutedEmail, setMuted] = useState<string[]>([]);
  const shown = tab === "unread" ? list.filter((n) => n.unread) : list;
  return (
    <div className="fixed inset-y-0 left-56 right-0 z-40 overflow-y-auto bg-background p-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-bold">Notifications</h1>
          <button onClick={readAll} className="text-sm text-primary">Mark all read</button>
        </div>
        <div className="mt-4 flex gap-4 border-b text-sm">
          {([["all", "All"], ["unread", `Unread (${unread})`], ["prefs", "Preferences"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("-mb-px border-b-2 pb-2", tab === k ? "border-primary font-semibold" : "border-transparent text-muted-foreground")}>{l}</button>
          ))}
        </div>
        {tab !== "prefs" ? (
          (["Today", "Yesterday", "Earlier"] as const).map((d) => {
            const rows = shown.filter((n) => n.day === d);
            if (!rows.length) return null;
            return (
              <div key={d} className="mt-6">
                <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{d}</h2>
                <div className="overflow-hidden rounded-lg border">
                  {rows.map((n) => (
                    <div key={n.id}>
                      <Row n={n} onRead={() => read(n.id)} />
                      {n.count && n.count > 1 && <div className="border-b bg-muted/40 px-9 py-1 text-xs text-muted-foreground">Grouped · {n.count} events in the last hour</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="mt-6 overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[1fr_80px_80px] border-b bg-muted/50 px-4 py-2 text-xs font-semibold">
              <span>Type</span><span className="text-center">In-app</span><span className="text-center">Email</span>
            </div>
            {types.map((t) => (
              <div key={t} className="grid grid-cols-[1fr_80px_80px] items-center border-b px-4 py-3 text-sm">
                <span>{t}</span>
                <span className="text-center text-muted-foreground" title="Always on"><Check className="mx-auto size-4" /></span>
                <button onClick={() => setMuted((m) => m.includes(t) ? m.filter((x) => x !== t) : [...m, t])} className="mx-auto">
                  {mutedEmail.includes(t) ? <X className="size-4 text-muted-foreground" /> : <Mail className="size-4 text-primary" />}
                </button>
              </div>
            ))}
            <p className="px-4 py-3 text-xs text-muted-foreground">In-app can't be turned off. Every email has a one-click unsubscribe.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// C: drawer from the right, toast on arrival, digest rows, kind chips.
function VariantC({ items }: { items: N[] }) {
  const { list, read, readAll, unread } = useInbox(items);
  const [open, setOpen] = useState(true);
  const [kind, setKind] = useState<Kind | "all">("all");
  useEffect(() => {
    const first = items.find((n) => n.unread);
    if (first) toast(first.title, { description: first.body });
  }, [items]);
  const shown = kind === "all" ? list : list.filter((n) => n.kind === kind);
  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed right-6 top-3 z-30 flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm shadow">
        <span className="relative"><Bell className="size-4" /><Badge n={unread} /></span> Inbox
      </button>
      {open && (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">Inbox</span>
            <div className="flex items-center gap-3">
              <button onClick={readAll} className="text-xs text-primary">Mark all read</button>
              <button onClick={() => setOpen(false)}><X className="size-4" /></button>
            </div>
          </div>
          <div className="flex gap-2 border-b px-4 py-2 text-xs">
            {(["all", "money", "access", "activity"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={cn("rounded-full border px-2.5 py-1 capitalize", kind === k && "bg-primary text-primary-foreground")}>{k === "money" ? "Money" : k === "access" ? "Access" : k}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {shown.map((n) => (
              <div key={n.id}>
                <Row n={n} onRead={() => read(n.id)} />
                {n.count && n.count > 1 && <div className="border-b bg-muted/40 px-9 py-1 text-xs text-muted-foreground">Grouped · {n.count} events in the last hour</div>}
              </div>
            ))}
          </div>
        </aside>
      )}
    </>
  );
}

export function PrototypeNotifications({
  role,
  isTeamAdmin,
}: {
  role: UserRole | null;
  isTeamAdmin: boolean;
}) {
  const [params] = useSearchParams();
  const variant = params.get("variant") ?? "A";
  const key = isTeamAdmin ? "teamadmin" : role ?? "student";
  const items = MOCK[key] ?? MOCK.student;
  if (!import.meta.env.DEV) return null;
  return (
    <>
      {variant === "A" && <VariantA items={items} />}
      {variant === "B" && <VariantB items={items} />}
      {variant === "C" && <VariantC items={items} />}
      <Switcher current={variant} />
    </>
  );
}
