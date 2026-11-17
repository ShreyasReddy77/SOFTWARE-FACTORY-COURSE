import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "~/components/ui/button";

export function LandingHero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-24 pb-20 text-left sm:pt-32">
      <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-7xl">
        Learn to code,
        <br />
        <span className="text-muted-foreground">at your own pace</span>
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        Structured courses built by experienced instructors. Track your
        progress, take quizzes, and build real-world skills.
      </p>
      <div className="mt-10 flex items-center justify-start gap-4">
        <Button asChild size="lg">
          <Link to="/courses">
            Browse Courses
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
