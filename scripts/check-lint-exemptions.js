// Fails when .oxlintrc.json gains a lint exemption: a file or glob newly added
// to an override that turns a rule off. Code that moves into a new file starts
// without exemptions; moving is the moment to retire the debt, not carry it.
// Removing an exemption is always fine.
// Usage: node scripts/check-lint-exemptions.js   (compares the file on disk with HEAD)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const CONFIG = ".oxlintrc.json";
const isOff = (value) =>
  value === "off" || (Array.isArray(value) && value[0] === "off");

export const exemptions = (jsonc) => {
  const { config } = ts.parseConfigFileTextToJson(CONFIG, jsonc);
  return new Set(
    (config.overrides ?? []).flatMap(({ files = [], rules = {} }) =>
      Object.entries(rules)
        .filter(([, value]) => isOff(value))
        .flatMap(([rule]) => files.map((file) => `${rule}: ${file}`))
    )
  );
};

export const addedExemptions = (before, after) => {
  const known = exemptions(before);
  return [...exemptions(after)].filter((entry) => !known.has(entry));
};

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  let before;
  try {
    before = execFileSync("git", ["show", `HEAD:${CONFIG}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    process.exit(0); // no HEAD version yet: nothing to compare with
  }
  const added = addedExemptions(before, readFileSync(CONFIG, "utf8"));
  if (added.length > 0) {
    console.error(
      `${CONFIG} adds lint exemptions. Fix the code instead (split the function, flatten the nesting):\n` +
        added.map((entry) => `  ${entry}`).join("\n")
    );
    process.exit(1);
  }
}
