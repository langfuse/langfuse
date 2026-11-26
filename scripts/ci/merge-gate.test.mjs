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
    for (const flags of [[], ["--preserve-symlinks-main"]]) {
      const result = spawnSync(process.execPath, [...flags, entry], {
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
    }
    const importGate = `await import(${JSON.stringify(new URL("./merge-gate.mjs", import.meta.url).href)}); console.log("imported");`;
    for (const launcher of [join(dir, "missing"), join(entry, "child"), dir]) {
      const imported = spawnSync(
        process.execPath,
        ["--input-type=module", "--eval", importGate, launcher],
        { encoding: "utf8" },
      );
      assert.equal(imported.status, 0, imported.stderr);
      assert.match(imported.stdout, /imported/);
    }
    const loop = join(dir, "loop");
    symlinkSync(loop, loop);
    const invalidLauncher = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", importGate, loop],
      { encoding: "utf8" },
    );
    assert.equal(invalidLauncher.status, 1, invalidLauncher.stderr);
    assert.match(invalidLauncher.stderr, /ELOOP/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("merge queue rejects missing or unexpectedly skipped jobs", () => {
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

test("changed-file provider selection permits only explicit exclusions", () => {
  const needs = successfulJobs();
  needs["test-worker-llm-connections"] = { result: "skipped" };
  needs["test-ai-gateway-e2e"] = { result: "skipped" };
  needs["tests-ai-gateway-guardrail-rules"] = { result: "skipped" };
  const selection = {
    result: "success",
    outputs: {
      llm_connections: "false",
      ai_gateway: "false",
      ai_gateway_guardrail_rules: "false",
    },
  };
  needs["llm-connections-filter"] = selection;
  for (const event of ["pull_request", "merge_group", "push"]) {
    assert.deepEqual(
      evaluateGate({ event, ref: "refs/heads/main", needs }),
      [],
      event,
    );
    for (const output of [
      "llm_connections",
      "ai_gateway",
      "ai_gateway_guardrail_rules",
    ]) {
      for (const changed of ["true", undefined]) {
        selection.outputs[output] = changed;
        assert.notEqual(evaluateGate({ event, needs }).length, 0);
      }
      selection.outputs[output] = "false";
    }
    for (const result of ["failure", "cancelled", "skipped", undefined]) {
      selection.result = result;
      assert.notEqual(evaluateGate({ event, needs }).length, 0);
    }
    selection.result = "success";
    delete needs["llm-connections-filter"];
    assert.notEqual(evaluateGate({ event, needs }).length, 0);
    needs["llm-connections-filter"] = selection;
    for (const job of [
      "test-worker-llm-connections",
      "test-ai-gateway-e2e",
      "tests-ai-gateway-guardrail-rules",
    ]) {
      for (const result of ["failure", "cancelled", undefined]) {
        if (result) needs[job] = { result };
        else delete needs[job];
        assert.notEqual(evaluateGate({ event, needs }).length, 0);
      }
      needs[job] = { result: "skipped" };
    }
    needs["tests-web"] = { result: "skipped" };
    assert.notEqual(evaluateGate({ event, needs }).length, 0);
    needs["tests-web"] = { result: "success" };
  }
  assert.notEqual(
    evaluateGate({ event: "workflow_dispatch", needs }).length,
    0,
    "manual validation runs the provider suites regardless of the diff",
  );
  assert.notEqual(
    evaluateGate({ event: "push", ref: "refs/tags/v4.1.0", needs }).length,
    0,
    "release validation runs the provider suites regardless of the diff",
  );
});

test("fork pull requests may skip the secret-bearing provider jobs", () => {
  const needs = successfulJobs();
  needs["llm-connections-filter"] = {
    result: "success",
    outputs: { llm_connections: "true", ai_gateway: "true" },
  };
  for (const job of ["test-worker-llm-connections", "test-ai-gateway-e2e"]) {
    needs[job] = { result: "skipped" };
    assert.deepEqual(
      evaluateGate({ event: "pull_request", needs, fork: true }),
      [],
      job,
    );
    assert.notEqual(
      evaluateGate({ event: "pull_request", needs }).length,
      0,
      job,
    );
    needs[job] = { result: "failure" };
    assert.notEqual(
      evaluateGate({ event: "pull_request", needs, fork: true }).length,
      0,
      job,
    );
    needs[job] = { result: "success" };
  }
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
