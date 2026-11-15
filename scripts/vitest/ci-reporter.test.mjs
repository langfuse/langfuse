import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { VitestCiReporter } from "./ci-reporter.ts";

const testCase = ({
  file,
  name,
  duration,
  state = "passed",
  retryCount = 0,
  flaky = false,
  diagnostic = true,
}) => ({
  fullName: name,
  module: { moduleId: `/abs/${file}`, relativeModuleId: file },
  diagnostic: () => (diagnostic ? { duration, flaky, retryCount } : undefined),
  result: () => ({ state }),
});

/** Runs the reporter over one module of test cases and captures its stdout. */
const report = (cases) => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));

  try {
    new VitestCiReporter().onTestRunEnd([
      { children: { allTests: () => cases } },
    ]);
  } finally {
    console.log = original;
  }

  return lines.join("\n");
};

/** The lines of one `Header (N):`-style block, header excluded. */
const block = (output, header) => {
  const body = output.split(header)[1];
  if (body === undefined) return undefined;

  const lines = [];
  for (const line of body.split("\n").slice(1)) {
    // Blocks are separated by a blank line, so the first non-ranked line ends
    // this one — without it, every later block would leak into the result.
    if (!/^\s*\d+\./.test(line)) break;
    lines.push(line);
  }

  return lines;
};

test("timing artifacts keep every project/file and reject incomplete measurements", () => {
  const directory = mkdtempSync(join(tmpdir(), "vitest-ci-timings-"));
  const timingPath = join(directory, "nested", "timings.json");
  const modules = Array.from({ length: 12 }, (_, index) => ({
    id: `module-${index}`,
    moduleId: "/repo/web/src/example.test.ts",
    relativeModuleId: "src/example.test.ts",
    project: {
      name: `project-${index}`,
      config: {
        root: "/repo/web",
        sequence: {
          seed: 9382,
          shuffle: true,
          sequencer: class FileSequencer {},
        },
      },
    },
    state: () => "passed",
    diagnostic: () => ({
      duration: 400 + index,
      collectDuration: 20,
      setupDuration: 10,
      prepareDuration: 5,
      environmentSetupDuration: 3,
    }),
    children: { allTests: () => [] },
  }));
  const specifications = modules.map((module) => ({
    taskId: module.id,
    moduleId: module.moduleId,
    project: module.project,
  }));
  modules[11].project.config.sequence = { shuffle: false };
  modules[10].project.config.browser = { enabled: true };
  try {
    const reporter = new VitestCiReporter(timingPath);
    reporter.onTestRunStart(specifications);
    reporter.onTestModuleStart(modules[1]);
    reporter.onTestModuleStart(modules[0]);
    reporter.onTestRunEnd(modules, [], "passed");
    const complete = JSON.parse(readFileSync(timingPath, "utf8"));
    assert.equal(complete.complete, true);
    assert.equal(complete.files.length, 12);
    assert.equal(
      new Set(complete.files.map((file) => file.project.name)).size,
      12,
    );
    assert.deepEqual(complete.files[0].timingsMs, {
      execution: 400,
      collect: 20,
      setup: 10,
      prepare: 5,
      environmentSetup: 3,
    });
    assert.deepEqual(complete.files[0].sequence, {
      seed: 9382,
      shuffleTests: true,
      shuffleFiles: null,
      fileSequencer: "FileSequencer",
      shuffleFilesUnavailableReason:
        "Resolved Vitest configuration exposes the sequencer, not a file-shuffle flag",
    });
    assert.deepEqual(complete.files[11].sequence, {
      seed: null,
      shuffleTests: false,
      shuffleFiles: null,
      fileSequencer: null,
      shuffleFilesUnavailableReason:
        "Resolved Vitest configuration exposes the sequencer, not a file-shuffle flag",
    });
    assert.deepEqual(complete.startedFileIds, ["module-1", "module-0"]);
    assert.equal(complete.files[10].timingsMs.environmentSetup, null);
    assert.equal(
      complete.files[10].unavailableTimings.environmentSetup,
      "Browser runner does not measure environment loading",
    );
    assert.equal(complete.usableForSharding, true);
    assert.equal(complete.allFilesMeasured, true);

    modules[11].state = () => "skipped";
    reporter.onTestRunStart(specifications);
    reporter.onTestRunEnd(modules, [], "passed");
    const partial = JSON.parse(readFileSync(timingPath, "utf8"));
    assert.equal(partial.complete, true);
    assert.equal(partial.usableForSharding, true);
    assert.equal(partial.allFilesMeasured, false);
    assert.equal(partial.eligibleFileCount, 11);
    assert.deepEqual(partial.unmeasuredFileIds, ["module-11"]);
    assert.deepEqual(partial.startedFileIds, []);
    assert.equal(partial.files.length, 12);
    assert.equal(partial.files[11].timingsMs.execution, null);
    assert.equal(partial.files[11].eligibleForSharding, false);
    assert.equal(
      partial.files[11].unavailableTimings.execution,
      "File skipped",
    );
    modules[0].diagnostic = () => ({
      duration: Number.NaN,
      collectDuration: 20,
      setupDuration: 10,
      prepareDuration: 5,
      environmentSetupDuration: 3,
    });
    const missing = {
      ...specifications[0],
      taskId: "missing-file",
      moduleId: "/repo/web/src/missing.test.ts",
    };
    modules[0].state = () => "failed";
    modules[0].children.allTests = () => [
      testCase({
        file: "src/example.test.ts",
        name: "underlying failure",
        duration: 12,
        state: "failed",
      }),
    ];
    reporter.onTestRunStart([...specifications, missing]);
    const lines = [];
    const original = console.log;
    console.log = (line) => lines.push(String(line));
    try {
      assert.throws(
        () => reporter.onTestRunEnd(modules, [], "failed"),
        /Incomplete Vitest timing report/,
      );
    } finally {
      console.log = original;
    }
    const diagnostics = lines.join("\n");
    assert.deepEqual(block(diagnostics, "\nFailed tests (1):"), [
      "1. retries=0 src/example.test.ts > underlying failure",
    ]);
    assert.match(diagnostics, /Slowest tests \(top 10\)/);
    assert.match(
      diagnostics,
      /Slowest test files \(top 10, summed test durations\)/,
    );
    const incomplete = JSON.parse(readFileSync(timingPath, "utf8"));
    assert.equal(incomplete.complete, false);
    assert.equal(incomplete.files.length, 13);
    assert.equal(incomplete.files[0].timingsMs.execution, null);
    assert.ok(incomplete.files[0].invalid.includes("execution"));
    assert.ok(incomplete.files[12].invalid.includes("module not reported"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("lists a failed test that no other block would have shown", () => {
  // The langfuse#18741 case: a suite opting out with `describe(..., {retry: 0})`
  // fails with retryCount 0, so it reaches neither the retried block nor —
  // being fast — the slowest ten.
  const slowPassing = Array.from({ length: 12 }, (_, index) =>
    testCase({
      file: "src/slow.test.ts",
      name: `slow ${index}`,
      duration: 10_000 + index,
    }),
  );
  const output = report([
    ...slowPassing,
    testCase({
      // The reporter prints vitest's relativeModuleId, which is relative to
      // the package the suite runs from — never package-prefixed.
      file: "src/__tests__/nativeOtelMedia.unit.test.ts",
      name: "native media > compares generated media spellings",
      duration: 12,
      state: "failed",
    }),
  ]);

  assert.deepEqual(block(output, "\nFailed tests (1):"), [
    "1. retries=0 src/__tests__/nativeOtelMedia.unit.test.ts > native media > compares generated media spellings",
  ]);
  assert.ok(
    !output.includes("Retried tests"),
    "a failure that never retried must not fabricate a retried block",
  );
  assert.ok(
    !block(output, "\nSlowest tests (top 10):").some((line) =>
      line.includes("nativeOtelMedia"),
    ),
    "the fixture must keep the failure out of the slowest ten",
  );
});

test("separates an exhausted-retry flake from a deterministic failure", () => {
  const output = report([
    testCase({
      file: "src/a.servertest.ts",
      name: "flaked until it ran out of attempts",
      duration: 500,
      state: "failed",
      retryCount: 3,
    }),
    testCase({
      file: "src/b.servertest.ts",
      name: "broke on every attempt it was given",
      duration: 400,
      state: "failed",
    }),
    testCase({
      file: "src/c.servertest.ts",
      name: "recovered on its second attempt",
      duration: 300,
      retryCount: 1,
      flaky: true,
    }),
  ]);

  // Highest retry count first, so whatever was given the most attempts leads.
  assert.deepEqual(block(output, "\nFailed tests (2):"), [
    "1. retries=3 src/a.servertest.ts > flaked until it ran out of attempts",
    "2. retries=0 src/b.servertest.ts > broke on every attempt it was given",
  ]);
  // The retried block keeps its own membership rule: retried, pass or fail.
  assert.deepEqual(block(output, "\nRetried tests (2):"), [
    "1. retries=3 src/a.servertest.ts > flaked until it ran out of attempts [failed]",
    "2. retries=1 src/c.servertest.ts > recovered on its second attempt [flaky]",
  ]);
});

test("caps the list but keeps the true total in the header", () => {
  const output = report(
    Array.from({ length: 63 }, (_, index) =>
      testCase({
        file: "src/mass.servertest.ts",
        name: `case ${index}`,
        duration: 5,
        state: "failed",
      }),
    ),
  );

  // The header is the count the analyst reads, so it must stay honest even
  // though the list below it is bounded.
  const listed = block(output, "\nFailed tests (63):");
  assert.equal(listed.length, 50);
  assert.ok(
    output.includes("\n… and 13 more"),
    "truncation must be explicit, never silent",
  );
});

test("omits the block when nothing failed", () => {
  const output = report([
    testCase({ file: "src/a.servertest.ts", name: "passes", duration: 10 }),
    testCase({
      file: "src/b.servertest.ts",
      name: "passes after a retry",
      duration: 20,
      retryCount: 2,
      flaky: true,
    }),
  ]);

  assert.ok(output.includes("Slowest tests (top 10):"));
  assert.ok(output.includes("Retried tests (1):"));
  assert.ok(
    !output.includes("Failed tests"),
    "a green run's log must look exactly as it did before",
  );
});

test("ignores tests that never produced a result", () => {
  const output = report([
    testCase({
      file: "src/a.servertest.ts",
      name: "passes",
      duration: 10,
    }),
    testCase({
      file: "src/b.servertest.ts",
      name: "skipped",
      duration: 0,
      state: "skipped",
    }),
    testCase({
      file: "src/c.servertest.ts",
      name: "never ran",
      duration: 0,
      state: "failed",
      diagnostic: false,
    }),
  ]);

  assert.ok(
    !output.includes("Failed tests"),
    "skipped tests and tests without a diagnostic are not failures",
  );
});
