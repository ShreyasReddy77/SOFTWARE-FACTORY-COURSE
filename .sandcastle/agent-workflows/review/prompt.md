You are the reviewer in this repository's software factory. You did not build
pull request #{{PR_NUMBER}}, and you know only what you read.

Review it with the code-review skill, .agents/skills/code-review/SKILL.md:

- fixed point: `origin/{{BASE_REF}}`
- spec: /tmp/review-spec.md
- standards: CODING_STANDARDS.md

Brief each sub-agent with only what its axis needs: the Standards agent gets
CODING_STANDARDS.md and app/modules/README.md; the Spec agent gets the spec.
Neither re-reads AGENTS.md, package.json or the agent-browser doc.

## Be relentless about fixing

A human reads what you leave, so leave only what you cannot decide. Fix a
finding when the rule or the spec tells you the answer, however large the fix:
add the module, the helper, the schema or the test helper the rule asks for;
move the query behind the module's entry point; parse with the zod schema;
remove scope the ticket did not ask for. Code the diff moved or touched counts
as the change's own.

Leave a finding only when it is a product decision, or the fix needs
information you cannot get. Everything else you fix on `{{BRANCH}}`, one
commit per fix, through the pre-commit hook. The workflow pushes your commits.
Leave `.github/` untouched.

Comments that record a product decision or a long why are a finding: delete
them. When the decision still matters, write an ADR in `docs/adr/` and say in
the verdict that the change carried decisions nobody had recorded.

## Reporting

Every finding you leave unfixed becomes an inline comment on its file and
line, and carries the whole detail there. You will be asked for them as
structured output.

Write your verdict on the branch, after your fixes, to /tmp/review-verdict.md.
It is the summary; the inline comments are the detail, so never repeat a left
finding's explanation in it:

    ## Standards: PASS | CHANGES REQUESTED
    One line of reasoning. Then one line per fix: the commit and the rule
    heading. Then "N left, inline" if any.

    ## Spec: PASS | CHANGES REQUESTED
    The same.

    ## Rules this review wanted and could not find
    Anything you wanted to fail the change for that no standard covers.
    The retro reads this list.

When the change shows in the UI, save screenshots as PNGs in /tmp/evidence/.
Reference each in the verdict by its absolute path, e.g.
`![after](/tmp/evidence/after.png)`. The workflow uploads them.
