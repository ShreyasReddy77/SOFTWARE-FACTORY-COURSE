import { BookOpen, GraduationCap, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Stat = { icon: LucideIcon; value: string | number; label: string };

export function LandingStats({
  totalCourses,
  totalCategories,
}: {
  totalCourses: number;
  totalCategories: number;
}) {
  const stats: Stat[] = [
    { icon: BookOpen, value: totalCourses, label: "Available Courses" },
    { icon: GraduationCap, value: totalCategories, label: "Categories" },
    { icon: Users, value: "Self-paced", label: "Learn on your schedule" },
  ];
  return (
    <section className="border-y border-border bg-muted/50 py-12">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 sm:grid-cols-3">
        {stats.map(({ icon: Icon, value, label }) => (
          <div key={label} className="flex items-center gap-4 text-left">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="size-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
