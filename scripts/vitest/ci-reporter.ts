import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";

const SLOW_TEST_LIMIT = 10;
const SLOW_FILE_LIMIT = 10;
/** Caps the Failed tests list so the earlier blocks survive a log tail */
const FAILED_TEST_LIMIT = 50;

type TestCaseLike = {
  fullName: string;
  module: {
    moduleId: string;
    relativeModuleId?: string;
  };
  diagnostic():
    | { duration: number; flaky?: boolean; retryCount?: number }
    | undefined;
  result(): { state: string };
};

type TestModuleLike = {
  id?: string;
  moduleId?: string;
  relativeModuleId?: string;
  project?: TimingProject;
  state?(): string;
  diagnostic?(): {
    duration: number;
    collectDuration: number;
    setupDuration: number;
    prepareDuration: number;
    environmentSetupDuration: number;
  };
  children: {
    allTests(): Iterable<TestCaseLike>;
  };
};

type TimingSequence = {
  seed?: number;
  shuffle?: boolean;
  sequencer?: unknown;
};

type TimingProject = {
  name: string;
  globalConfig?: {
    sequence: TimingSequence;
    shard?: { index: number; count: number };
  };
  config: {
    root: string;
    sequence: TimingSequence;
    shard?: { index: number; count: number };
    browser?: { enabled?: boolean };
  };
};

type TimingSpecification = {
  taskId: string;
  moduleId: string;
  project: TimingProject;
};

type TimingEntry = {
  module?: TestModuleLike;
  specification?: TimingSpecification;
};

type TimingFile = ReturnType<typeof createTimingFile>;
type TimingReport = ReturnType<typeof createTimingReport>;

type TestResult = {
  duration: number;
  file: string;
  name: string;
  state: string;
  retryCount: number;
  flaky: boolean;
};

type SlowFile = {
  duration: number;
  file: string;
  testCount: number;
};

const formatDuration = (duration: number) =>
  duration >= 1000
    ? `${(duration / 1000).toFixed(2)}s`
    : `${Math.round(duration)}ms`;

export class VitestCiReporter {
  private timingPath: string | undefined;
  private specifications: ReadonlyArray<TimingSpecification> | undefined;
  private startedFileIds: Array<string | null> = [];

  constructor(timingPath = process.env.VITEST_CI_TIMINGS_PATH) {
    this.timingPath = timingPath;
  }

  onTestRunStart(specifications: ReadonlyArray<TimingSpecification>) {
    this.specifications = specifications;
    this.startedFileIds = [];
    if (this.timingPath) rmSync(this.timingPath, { force: true });
  }

  onTestModuleStart(testModule: TestModuleLike) {
    if (this.timingPath) this.startedFileIds.push(testModule.id ?? null);
  }

  onTestRunEnd(
    testModules: ReadonlyArray<TestModuleLike>,
    unhandledErrors: ReadonlyArray<unknown> = [],
    reason?: string,
  ) {
    printTestDiagnostics(testModules);
    if (this.timingPath) {
      writeTimings(
        this.timingPath,
        this.specifications,
        testModules,
        unhandledErrors.length,
        reason,
        this.startedFileIds,
      );
    }
  }
}

function printTestDiagnostics(testModules: ReadonlyArray<TestModuleLike>) {
  const completedTests = testModules
    .flatMap((testModule) => [...testModule.children.allTests()])
    .map((testCase) => {
      const diagnostic = testCase.diagnostic();
      const duration = diagnostic?.duration;

      if (
        diagnostic === undefined ||
        duration === undefined ||
        !Number.isFinite(duration)
      ) {
        return undefined;
      }

      const result = testCase.result();

      if (result.state === "skipped") {
        return undefined;
      }

      return {
        duration,
        file: testCase.module.relativeModuleId ?? testCase.module.moduleId,
        name: testCase.fullName,
        state: result.state,
        retryCount: diagnostic.retryCount ?? 0,
        flaky: diagnostic.flaky ?? false,
      };
    })
    .filter((test): test is TestResult => test !== undefined);

  const slowestTests = [...completedTests]
    .sort((left, right) => right.duration - left.duration)
    .slice(0, SLOW_TEST_LIMIT);

  if (slowestTests.length === 0) {
    return;
  }

  const rankWidth = String(slowestTests.length).length;
  const durationWidth = Math.max(
    ...slowestTests.map((test) => formatDuration(test.duration).length),
  );

  console.log(`\nSlowest tests (top ${SLOW_TEST_LIMIT}):`);

  slowestTests.forEach((test, index) => {
    const rank = String(index + 1).padStart(rankWidth, " ");
    const duration = formatDuration(test.duration).padStart(durationWidth, " ");
    const state = test.state === "passed" ? "" : ` [${test.state}]`;
    const retry = test.retryCount > 0 ? ` [retries=${test.retryCount}]` : "";
    const flaky = test.flaky ? " [flaky]" : "";

    console.log(
      `${rank}. ${duration} ${test.file} > ${test.name}${state}${retry}${flaky}`,
    );
  });

  const slowestFiles = Array.from(
    [...completedTests]
      .reduce<Map<string, SlowFile>>((filesByPath, test) => {
        const current = filesByPath.get(test.file) ?? {
          duration: 0,
          file: test.file,
          testCount: 0,
        };

        current.duration += test.duration;
        current.testCount += 1;
        filesByPath.set(test.file, current);

        return filesByPath;
      }, new Map())
      .values(),
  )
    .sort((left, right) => right.duration - left.duration)
    .slice(0, SLOW_FILE_LIMIT);

  const fileRankWidth = String(slowestFiles.length).length;
  const fileDurationWidth = Math.max(
    ...slowestFiles.map((file) => formatDuration(file.duration).length),
  );
  const testCountWidth = Math.max(
    ...slowestFiles.map((file) => String(file.testCount).length),
  );

  console.log(
    `\nSlowest test files (top ${SLOW_FILE_LIMIT}, summed test durations):`,
  );

  slowestFiles.forEach((file, index) => {
    const rank = String(index + 1).padStart(fileRankWidth, " ");
    const duration = formatDuration(file.duration).padStart(
      fileDurationWidth,
      " ",
    );
    const testCount = String(file.testCount).padStart(testCountWidth, " ");
    const pluralizedTests = file.testCount === 1 ? "test" : "tests";

    console.log(
      `${rank}. ${duration} ${file.file} (${testCount} ${pluralizedTests})`,
    );
  });

  const retriedTests = completedTests.filter((test) => test.retryCount > 0);

  if (retriedTests.length > 0) {
    const retryRankWidth = String(retriedTests.length).length;

    console.log(`\nRetried tests (${retriedTests.length}):`);
    retriedTests
      .sort((left, right) => right.retryCount - left.retryCount)
      .forEach((test, index) => {
        const rank = String(index + 1).padStart(retryRankWidth, " ");
        const flaky = test.flaky ? " [flaky]" : "";
        const state = test.state === "passed" ? "" : ` [${test.state}]`;

        console.log(
          `${rank}. retries=${test.retryCount} ${test.file} > ${test.name}${state}${flaky}`,
        );
      });
  }

  printFailedTests(completedTests);
}

/** Module diagnostics include hooks and collection; summed test times do not. */
function writeTimings(
  output: string,
  specifications: ReadonlyArray<TimingSpecification> | undefined,
  modules: ReadonlyArray<TestModuleLike>,
  unhandledErrorCount: number,
  reason: string | undefined,
  startedFileIds: ReadonlyArray<string | null>,
) {
  const entries = collectTimingEntries(specifications, modules);
  const files = entries.map(createTimingFile);
  const report = createTimingReport(
    specifications,
    files,
    unhandledErrorCount,
    reason,
    startedFileIds,
  );
  persistTimingReport(output, report);
  assertCompleteTimingReport(output, report);
}

function collectTimingEntries(
  specifications: ReadonlyArray<TimingSpecification> | undefined,
  modules: ReadonlyArray<TestModuleLike>,
): TimingEntry[] {
  const entries: TimingEntry[] = modules.map((module) => ({ module }));
  for (const specification of specifications ?? []) {
    if (!modules.some((module) => module.id === specification.taskId))
      entries.push({ specification });
  }
  return entries;
}

function createTimingFile(entry: TimingEntry) {
  const project = entry.module?.project ?? entry.specification?.project;
  const identity = readTimingIdentity(entry, project);
  const measurements = readTimingMeasurements(
    entry.module,
    project,
    identity.value.state,
  );
  const sequence = readTimingSequence(project);
  const invalid = identity.invalid.concat(
    measurements.invalid,
    sequence.invalid,
  );
  return {
    ...identity.value,
    testCount: entry.module
      ? [...entry.module.children.allTests()].length
      : null,
    sequence: sequence.value,
    shard: project?.globalConfig?.shard ?? project?.config.shard ?? null,
    timingsMs: measurements.timingsMs,
    unavailableTimings: measurements.unavailableTimings,
    eligibleForSharding:
      identity.value.state === "passed" && invalid.length === 0,
    invalid,
  };
}

function readTimingIdentity(
  { module, specification }: TimingEntry,
  project: TimingProject | undefined,
) {
  const invalid: string[] = [];
  const moduleId = module?.moduleId ?? specification?.moduleId ?? null;
  const id = module?.id ?? specification?.taskId ?? null;
  if (!id) invalid.push("id");
  if (!moduleId) invalid.push("moduleId");
  if (!project?.config.root || typeof project.name !== "string")
    invalid.push("project");
  if (!module) invalid.push("module not reported");
  const state = module?.state?.() ?? "missing";
  if (!["passed", "failed", "skipped"].includes(state)) invalid.push("state");
  return {
    value: {
      id,
      moduleId,
      file:
        module?.relativeModuleId ??
        (project && moduleId ? relative(project.config.root, moduleId) : null),
      project: project
        ? { name: project.name, root: project.config.root }
        : null,
      state,
    },
    invalid,
  };
}

function finiteNonnegative(value: number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return value;
  return null;
}

function readTimingMeasurements(
  module: TestModuleLike | undefined,
  project: TimingProject | undefined,
  state: string,
) {
  const diagnostic = module?.diagnostic?.();
  const unavailableTimings: Record<string, string> = {};
  if (state === "skipped") unavailableTimings.execution = "File skipped";
  if (project?.config.browser?.enabled)
    unavailableTimings.environmentSetup =
      "Browser runner does not measure environment loading";
  const timingsMs = {
    execution:
      state === "skipped" ? null : finiteNonnegative(diagnostic?.duration),
    collect: finiteNonnegative(diagnostic?.collectDuration),
    setup: finiteNonnegative(diagnostic?.setupDuration),
    prepare: finiteNonnegative(diagnostic?.prepareDuration),
    environmentSetup: project?.config.browser?.enabled
      ? null
      : finiteNonnegative(diagnostic?.environmentSetupDuration),
  };
  const invalid = Object.entries(timingsMs)
    .filter(
      ([phase, value]) => value === null && !(phase in unavailableTimings),
    )
    .map(([phase]) => phase);
  return { timingsMs, unavailableTimings, invalid };
}

function readTimingSequence(project: TimingProject | undefined) {
  // Vitest serializes the global sequence to workers; unshuffled runs can
  // legitimately have no seed, while shuffled runs require a measured seed.
  const sequence = project?.globalConfig?.sequence ?? project?.config.sequence;
  const unseeded =
    sequence !== undefined && sequence.seed === undefined && !sequence.shuffle;
  const seed = unseeded ? null : finiteNonnegative(sequence?.seed);
  return {
    value: {
      seed,
      shuffleTests: sequence ? Boolean(sequence.shuffle) : null,
      // Resolution replaces shuffle.files with a sequencer constructor. Its
      // name is useful metadata but cannot establish a custom sequencer's behavior.
      shuffleFiles: null,
      fileSequencer:
        typeof sequence?.sequencer === "function"
          ? sequence.sequencer.name
          : null,
      shuffleFilesUnavailableReason:
        "Resolved Vitest configuration exposes the sequencer, not a file-shuffle flag",
    },
    invalid: seed === null && !unseeded ? ["sequence.seed"] : [],
  };
}

function createTimingReport(
  specifications: ReadonlyArray<TimingSpecification> | undefined,
  files: ReadonlyArray<TimingFile>,
  unhandledErrorCount: number,
  reason: string | undefined,
  startedFileIds: ReadonlyArray<string | null>,
) {
  const complete =
    specifications !== undefined &&
    files.length > 0 &&
    reason !== undefined &&
    startedFileIds.every((id) => id !== null) &&
    files.every((file) => file.invalid.length === 0);
  const eligibleFiles = files.filter((file) => file.eligibleForSharding);
  return {
    version: 1,
    unit: "milliseconds",
    complete,
    usableForSharding:
      complete &&
      reason === "passed" &&
      unhandledErrorCount === 0 &&
      eligibleFiles.length > 0,
    // Partial measurements remain useful, but unmeasured files must retain a
    // conservative weight or acquire a measurement before a complete plan.
    allFilesMeasured: complete && eligibleFiles.length === files.length,
    eligibleFileCount: eligibleFiles.length,
    unmeasuredFileIds: files
      .filter((file) => !file.eligibleForSharding)
      .map((file) => file.id),
    reason: reason ?? null,
    expectedFileCount: specifications?.length ?? null,
    unhandledErrorCount,
    startedFileIds,
    // Collection includes dependency imports and suite callbacks. These phases
    // are diagnostic counters, not a sum of wall-clock time across workers.
    files,
  };
}

function persistTimingReport(output: string, report: TimingReport) {
  mkdirSync(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(temporary, output);
}

function assertCompleteTimingReport(output: string, report: TimingReport) {
  if (!report.complete)
    throw new Error(`Incomplete Vitest timing report: ${output}`);
}

/** Lists every non-passed test case; absent on a green run */
function printFailedTests(completedTests: TestResult[]): void {
  const failedTests = completedTests.filter((test) => test.state !== "passed");

  if (failedTests.length === 0) {
    return;
  }

  const listed = [...failedTests]
    .sort((left, right) => right.retryCount - left.retryCount)
    .slice(0, FAILED_TEST_LIMIT);
  const failedRankWidth = String(listed.length).length;

  console.log(`\nFailed tests (${failedTests.length}):`);
  listed.forEach((test, index) => {
    const rank = String(index + 1).padStart(failedRankWidth, " ");

    console.log(
      `${rank}. retries=${test.retryCount} ${test.file} > ${test.name}`,
    );
  });

  if (failedTests.length > listed.length) {
    console.log(`… and ${failedTests.length - listed.length} more`);
  }
}
