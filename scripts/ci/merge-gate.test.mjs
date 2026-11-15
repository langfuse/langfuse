import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { evaluateGate, requiredJobs } from "./merge-gate.mjs";

const successfulJobs = () =>
  Object.fromEntries(requiredJobs.map((name) => [name, { result: "success" }]));

test("CLI rejects missing jobs when invoked through a symlink", () => {
  const dir = mkdtempSync(join(tmpdir(), "merge-gate-"));
  try {
    const entry = join(dir, "gate.mjs");
    symlinkSync(
      fileURLToPath(new URL("./merge-gate.mjs", import.meta.url)),
      entry,
    );
    const result = spawnSync(process.execPath, [entry], {
      encoding: "utf8",
      env: {
        ...process.env,
        NEEDS_JSON: "{}",
        GITHUB_EVENT_NAME: "merge_group",
        GITHUB_OUTPUT: "",
      },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /expected success, received missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("merge queue requires every gating suite, including provider tests", () => {
  assert.deepEqual(
    evaluateGate({ event: "merge_group", needs: successfulJobs() }),
    [],
  );
  for (const name of requiredJobs) {
    for (const result of ["failure", "cancelled", "skipped", undefined]) {
      const needs = successfulJobs();
      if (result) needs[name] = { result };
      else delete needs[name];
      assert.notEqual(
        evaluateGate({ event: "merge_group", needs }).length,
        0,
        `${name}: ${result}`,
      );
    }
  }
});

test("PR provider selection permits only explicit exclusions", () => {
  const needs = successfulJobs();
  needs["test-worker-llm-connections"] = { result: "skipped" };
  needs["test-ai-gateway-e2e"] = { result: "skipped" };
  needs["llm-connections-filter"] = {
    result: "success",
    outputs: { changed: "false" },
  };
  needs["ai-gateway-filter"] = {
    result: "success",
    outputs: { changed: "false" },
  };
  assert.deepEqual(evaluateGate({ event: "pull_request", needs }), []);
  needs["llm-connections-filter"].outputs.changed = "true";
  assert.notEqual(evaluateGate({ event: "pull_request", needs }).length, 0);
  needs["llm-connections-filter"].outputs.changed = "false";
  needs["tests-web"] = { result: "skipped" };
  assert.notEqual(evaluateGate({ event: "pull_request", needs }).length, 0);
});

test("a duplicate push cannot excuse a failed job or a failed tag check", () => {
  const needs = Object.fromEntries(
    requiredJobs.map((name) => [name, { result: "skipped" }]),
  );
  needs["pre-job"] = { result: "success", outputs: { should_skip: "true" } };
  assert.deepEqual(
    evaluateGate({ event: "push", ref: "refs/heads/main", needs }),
    [],
  );
  needs["tests-worker"] = { result: "failure" };
  assert.notEqual(evaluateGate({ event: "push", needs }).length, 0);
  needs["tests-worker"] = { result: "skipped" };
  assert.notEqual(
    evaluateGate({ event: "push", ref: "refs/tags/v3.1.0", needs }).length,
    0,
  );
  needs["validate-v3-release-tag"] = { result: "success" };
  assert.notEqual(
    evaluateGate({ event: "push", ref: "refs/tags/v3.1.0", needs }).length,
    0,
    "release provider checks must run even when the application tree was tested",
  );
  const dispatch = successfulJobs();
  dispatch["validate-v3-release-tag"] = { result: "skipped" };
  assert.deepEqual(
    evaluateGate({
      event: "workflow_dispatch",
      ref: "refs/tags/v3.1.0",
      needs: dispatch,
    }),
    [],
  );
});
