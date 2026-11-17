import { describe, expect, it } from "vitest";
import { addedExemptions } from "./check-lint-exemptions.js";

const config = (files: string[]) => `{
  // comments are allowed
  "overrides": [{ "files": ${JSON.stringify(files)}, "rules": { "max-depth": "off" } }]
}`;

describe("addedExemptions", () => {
  it("reports a file added to an override that turns a rule off", () => {
    expect(addedExemptions(config(["a.ts"]), config(["a.ts", "b.ts"]))).toEqual(
      ["max-depth: b.ts"]
    );
  });

  it("accepts removing an exemption", () => {
    expect(addedExemptions(config(["a.ts", "b.ts"]), config(["a.ts"]))).toEqual(
      []
    );
  });

  it("ignores overrides that change a rule's options instead of turning it off", () => {
    const before = config([]);
    const after = `{ "overrides": [{ "files": ["c.ts"], "rules": { "max-depth": ["error", 5] } }] }`;
    expect(addedExemptions(before, after)).toEqual([]);
  });
});
