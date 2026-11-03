import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPlan, parseOptions, runPlan } from "./check.mjs";

test("check no longer accepts a CPU budget argument", () => {
  assert.equal(Object.hasOwn(parseOptions([]), "cpus"), false);
  assert.throws(
    () => parseOptions(["--cpus", "2"]),
    /Unknown argument: --cpus/,
  );
});

test("failed Turbo run reads successful and cached prerequisites from its summary", async () => {
  const directory = mkdtempSync(resolve(".check-test-"));
  const previousPath = process.env.PATH;
  try {
    const summaryPath = resolve(directory, "summary.json");
    writeFileSync(
      summaryPath,
      JSON.stringify({
        tasks: [
          { taskId: "plugin#build", cache: { status: "HIT" } },
          { taskId: "a#build", execution: { exitCode: 0 } },
          { taskId: "web#typecheck", execution: { exitCode: 1 } },
          { taskId: "b#build", execution: { exitCode: 1 } },
        ],
      }),
    );
    writeFileSync(
      resolve(directory, "pnpm"),
      `#!${process.execPath}\nconsole.log(${JSON.stringify(`Summary: ${summaryPath}`)}); process.exit(1);\n`,
      { mode: 0o700 },
    );
    process.env.PATH = `${directory}:${previousPath ?? ""}`;
    for (const summary of ["valid", "missing", "invalid"]) {
      if (summary === "missing") rmSync(summaryPath);
      if (summary === "invalid") writeFileSync(summaryPath, "not JSON");
      const plan = [
        { isTurboBatch: true, args: [] },
        {
          requiresTurbo: true,
          prerequisites: ["plugin#build", "a#build"],
          steps: [],
        },
        { requiresTurbo: true, prerequisites: ["b#build"], steps: [] },
        { requiresTurbo: true, prerequisites: ["blocked#build"], steps: [] },
      ];
      const skipped = [];
      for await (const outcome of runPlan(plan, directory, 2)) {
        if (outcome.type === "skipped") skipped.push(outcome.checkIndex);
        if (outcome.error) throw outcome.error;
      }
      assert.deepEqual(skipped, summary === "valid" ? [2, 3] : [1, 2, 3]);
    }
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("split-out lint records transitive prerequisites, excluding scriptless tasks", () => {
  const tasks = new Map([
    ["web#lint", { dependencies: ["plugin#build", "shared#build"] }],
    ["plugin#build", { command: "tsc", dependencies: [] }],
    ["shared#build", { command: "tsc", dependencies: ["config#build"] }],
    [
      "config#build",
      { command: "<NONEXISTENT>", dependencies: ["base#build"] },
    ],
    ["base#build", { command: "tsc", dependencies: [] }],
  ]);
  const plan = createPlan(
    [],
    [
      {
        name: "web",
        path: "web",
        scripts: { lint: "oxlint --max-warnings 0" },
        dependencies: [],
      },
    ],
    { all: true, only: ["lint"] },
    "HEAD",
    { tasks, affected: new Set() },
  );
  assert.ok(plan[0].args.includes("--concurrency=1"));
  assert.deepEqual(plan[1].prerequisites, [
    "plugin#build",
    "shared#build",
    "base#build",
  ]);
});

test("Oxlint narrows source changes without ESLint-only flags", () => {
  const plan = createPlan(
    ["web/src/example.ts"],
    [
      {
        name: "web",
        path: "web",
        scripts: { lint: "dotenv -e ../.env -- oxlint --max-warnings 0" },
        dependencies: [],
      },
    ],
    { only: ["lint"] },
    "HEAD",
    {
      tasks: new Map([
        ["web#lint", { dependencies: [], inputFiles: new Set() }],
      ]),
      affected: new Set(["web#lint"]),
    },
    () => true,
  );
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].args, [
    "--filter",
    "web",
    "run",
    "lint",
    "--no-error-on-unmatched-pattern",
    "./src/example.ts",
  ]);
});

for (const cpus of [1, 2, 4]) {
  test(`unrelated Turbo failures do not skip lint (cpus=${cpus})`, async () => {
    const plan = [
      { label: "Turbo", isTurboBatch: true },
      {
        label: "Lint A",
        requiresTurbo: true,
        prerequisites: ["plugin#build", "a#build"],
      },
      {
        label: "Lint B",
        requiresTurbo: true,
        prerequisites: ["plugin#build", "b#build"],
      },
      {
        label: "Lint C",
        requiresTurbo: true,
        prerequisites: ["plugin#build", "c#build"],
      },
    ];
    const ran = [];
    const skipped = [];
    for await (const outcome of runPlan(plan, ".", cpus, async (check) => {
      ran.push(check.label);
      return {
        failure: check.isTurboBatch ? { status: 1 } : null,
        reports: [],
        // A's prerequisites succeeded; B failed and C was blocked or omitted.
        successfulTurboTasks: ["plugin#build", "a#build"],
      };
    })) {
      if (outcome.type === "skipped") skipped.push(outcome.check.label);
    }
    assert.deepEqual(ran, ["Turbo", "Lint A"]);
    assert.deepEqual(skipped, ["Lint B", "Lint C"]);
  });
}

test("missing Turbo summary conservatively skips dependent lint", async () => {
  const plan = [
    { isTurboBatch: true },
    { requiresTurbo: true, prerequisites: ["plugin#build"] },
  ];
  const outcomes = [];
  for await (const outcome of runPlan(plan, ".", 2, async () => ({
    failure: { status: 1 },
    reports: [],
  })))
    outcomes.push(outcome.type);
  assert.deepEqual(outcomes, ["started", "completed", "skipped"]);
});

test("successful Turbo batch needs no summary to run dependent lint", async () => {
  const plan = [
    { isTurboBatch: true },
    { requiresTurbo: true, prerequisites: ["plugin#build"] },
  ];
  const outcomes = [];
  for await (const outcome of runPlan(plan, ".", 2, async () => ({
    failure: null,
    reports: [],
  })))
    outcomes.push(outcome.type);
  assert.deepEqual(outcomes, ["started", "completed", "started", "completed"]);
});
