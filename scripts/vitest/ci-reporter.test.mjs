import assert from "node:assert/strict";
import test from "node:test";

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
