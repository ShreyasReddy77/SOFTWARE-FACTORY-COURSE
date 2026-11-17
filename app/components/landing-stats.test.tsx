import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingStats } from "./landing-stats";

describe("LandingStats", () => {
  it("shows the course and category counts with their labels", () => {
    const html = renderToStaticMarkup(
      <LandingStats totalCourses={12} totalCategories={4} />
    );
    expect(html).toMatch(/>12<\/p><p[^>]*>Available Courses</);
    expect(html).toMatch(/>4<\/p><p[^>]*>Categories</);
    expect(html).toContain("Self-paced");
  });

  it("left-aligns each stat tile", () => {
    const html = renderToStaticMarkup(
      <LandingStats totalCourses={1} totalCategories={1} />
    );
    expect(html).not.toContain("text-center");
    expect(html.match(/text-left/g)).toHaveLength(3);
  });
});
