const SLOW_TEST_LIMIT = 10;
const SLOW_FILE_LIMIT = 10;

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
  children: {
    allTests(): Iterable<TestCaseLike>;
  };
};

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
  onTestRunEnd(testModules: ReadonlyArray<TestModuleLike>) {
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
      const duration = formatDuration(test.duration).padStart(
        durationWidth,
        " ",
      );
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
  }
}
