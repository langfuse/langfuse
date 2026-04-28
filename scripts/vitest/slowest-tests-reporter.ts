const SLOW_TEST_LIMIT = 20;

type TestCaseLike = {
  fullName: string;
  module: {
    moduleId: string;
    relativeModuleId?: string;
  };
  diagnostic(): { duration: number } | undefined;
  result(): { state: string };
};

type TestModuleLike = {
  children: {
    allTests(): Iterable<TestCaseLike>;
  };
};

type SlowTest = {
  duration: number;
  file: string;
  name: string;
  state: string;
};

const formatDuration = (duration: number) =>
  duration >= 1000
    ? `${(duration / 1000).toFixed(2)}s`
    : `${Math.round(duration)}ms`;

export class SlowestTestsReporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModuleLike>) {
    const slowestTests = testModules
      .flatMap((testModule) => [...testModule.children.allTests()])
      .map((testCase) => {
        const diagnostic = testCase.diagnostic();
        const duration = diagnostic?.duration;

        if (duration === undefined || !Number.isFinite(duration)) {
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
        };
      })
      .filter((test): test is SlowTest => test !== undefined)
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

      console.log(`${rank}. ${duration} ${test.file} > ${test.name}${state}`);
    });
  }
}
