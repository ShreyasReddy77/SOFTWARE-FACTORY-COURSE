import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { LandingHero } from "./landing-hero";

function renderHero() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <LandingHero />
    </MemoryRouter>
  );
}

describe("LandingHero", () => {
  it("left-aligns the headline, copy and call to action", () => {
    const html = renderHero();
    const section = html.match(/^<section class="([^"]*)"/)?.[1];
    const actions = html.match(/<div class="([^"]*)"><a /)?.[1];
    expect(section?.split(" ")).toContain("text-left");
    expect(section).not.toContain("text-center");
    expect(actions?.split(" ")).toContain("justify-start");
    expect(actions).not.toContain("justify-center");
    expect(html).not.toContain("mx-auto mt-6");
  });

  it("links the call to action to the course catalogue", () => {
    const html = renderHero();
    expect(html).toMatch(/<a[^>]*href="\/courses"[^>]*>Browse Courses/);
  });
});
