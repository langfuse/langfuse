import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isCursorPr } from "./is-cursor-pr.mjs";

const workflow = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../.github/workflows/label-cursor-prs.yml",
  ),
  "utf8",
);

test("cursor[bot] authorship is enough", () => {
  assert.equal(isCursorPr({ author: "cursor[bot]" }), true);
});

test("cursor/ head ref is enough", () => {
  assert.equal(
    isCursorPr({ author: "nkabardin", headRef: "cursor/label-prs-231f" }),
    true,
  );
});

test("Cursor agent PR-body marker is enough", () => {
  assert.equal(
    isCursorPr({
      author: "nkabardin",
      headRef: "lfe-15605-cursor-pr-tag",
      body: "<!-- CURSOR_AGENT_PR_BODY_BEGIN -->\nhello\n",
    }),
    true,
  );
});

test("ordinary maintainer PRs are not labeled", () => {
  assert.equal(
    isCursorPr({
      author: "maxdeichmann",
      headRef: "lfe-12345-fix-filters",
      body: "## What does this PR do?\n",
    }),
    false,
  );
});

test("workflow stays on pull_request and does not check out PR code", () => {
  assert.match(workflow, /^on:\n  pull_request:/m);
  assert.doesNotMatch(workflow, /^on:\n  pull_request_target:/m);
  assert.match(
    workflow,
    /uses: actions\/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3/,
  );
  assert.doesNotMatch(workflow, /actions\/checkout@/);
});

test("workflow uses the same three Cursor signals as isCursorPr", () => {
  assert.match(workflow, /author === "cursor\[bot]"/);
  assert.match(workflow, /headRef\.startsWith\("cursor\/"\)/);
  assert.match(workflow, /body\.includes\("CURSOR_AGENT_PR_BODY_BEGIN"\)/);
});

test("workflow treats a concurrent createLabel 422 as success", () => {
  assert.match(workflow, /createError\.status !== 422/);
  assert.match(workflow, /Label already exists; continuing to apply it/);
});
