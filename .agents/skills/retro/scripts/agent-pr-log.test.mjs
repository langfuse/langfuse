import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  duplicateGroups,
  formatSearch,
  isAgentPullRequest,
  normalizeTitle,
  parseArgs,
  searchMatches,
} from "./agent-pr-log.mjs";

const scriptPath = new URL("./agent-pr-log.mjs", import.meta.url);

function pull(number, title, extras = {}) {
  return {
    number,
    title,
    url: `https://github.com/langfuse/langfuse/pull/${number}`,
    state: "OPEN",
    isDraft: false,
    headRefName: "lfe-1-example",
    author: { login: "app/cursor" },
    ...extras,
  };
}

test("normalizeTitle ignores case and punctuation", () => {
  assert.equal(
    normalizeTitle("fix(web): Drop WitnessAI logger flush 401s!"),
    normalizeTitle("fix web drop witnessai logger flush 401s"),
  );
});

test("duplicateGroups keeps only repeated titles", () => {
  const groups = duplicateGroups([
    pull(18658, "fix(web): drop WitnessAI logger flush 401s from Sentry"),
    pull(17771, "fix(web): drop WitnessAI logger flush 401s from Sentry"),
    pull(18138, "fix(web): drop Jam extension MobX collisions from Sentry"),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].map((item) => item.number),
    [18658, 17771],
  );
});

test("searchMatches requires every term", () => {
  const pulls = [
    pull(18658, "fix(web): drop WitnessAI logger flush 401s from Sentry"),
    pull(18138, "fix(web): drop Jam extension MobX collisions from Sentry"),
  ];
  assert.deepEqual(
    searchMatches(pulls, "WitnessAI logger").map((item) => item.number),
    [18658],
  );
  assert.equal(searchMatches(pulls, "WitnessAI Jam").length, 0);
});

test("isAgentPullRequest recognizes bot authors and cursor heads", () => {
  assert.equal(isAgentPullRequest(pull(1, "a")), true);
  assert.equal(
    isAgentPullRequest(
      pull(2, "a", {
        author: { login: "wochinge" },
        headRefName: "cursor/gateway-model-slugs-8c6e",
      }),
    ),
    true,
  );
  assert.equal(
    isAgentPullRequest(
      pull(3, "a", {
        author: { login: "wochinge" },
        headRefName: "lfe-1-chosen",
      }),
    ),
    false,
  );
});

test("formatSearch tells the caller to stop when an open PR matches", () => {
  const text = formatSearch(
    [pull(18658, "fix(web): drop WitnessAI logger flush 401s from Sentry")],
    "WitnessAI logger",
  );
  assert.match(text, /#18658/);
  assert.match(text, /Do not open another/);
});

test("parseArgs rejects a missing value", () => {
  assert.throws(() => parseArgs(["--search"]), /needs a value/);
});

test("fixture search exits 1 when an open title matches", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-pr-log-"));
  const fixture = path.join(directory, "prs.json");
  await writeFile(
    fixture,
    JSON.stringify([
      pull(18658, "fix(web): drop WitnessAI logger flush 401s from Sentry", {
        isDraft: true,
      }),
      pull(17771, "fix(web): drop WitnessAI logger flush 401s from Sentry", {
        isDraft: true,
      }),
      pull(9, "fix(web): something else", { state: "MERGED" }),
    ]),
  );
  const result = spawnSync(
    process.execPath,
    [scriptPath.pathname, "--fixture", fixture, "--search", "WitnessAI logger"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout, /#18658/);
  assert.match(result.stdout, /#17771/);
  assert.doesNotMatch(result.stdout, /#9/);
});

test("fixture log exits 0 and does not merge distinct titles", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-pr-log-"));
  const fixture = path.join(directory, "prs.json");
  await writeFile(
    fixture,
    JSON.stringify([
      pull(17111, "fix(web): drop Kitesurf browser-automation noise from Sentry"),
      pull(17112, "fix(web): drop kitesurf injected Proxy TypeError from Sentry"),
    ]),
  );
  const result = spawnSync(
    process.execPath,
    [scriptPath.pathname, "--fixture", fixture, "--since", "2026-09-01"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Agent PR log since 2026-09-01/);
  assert.match(result.stdout, /No duplicate titles/);
});
