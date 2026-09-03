// @vitest-environment node

import { revealScoreColumns } from "@/src/features/scores/lib/scoreColumns";

describe("revealScoreColumns", () => {
  it("defers while no score column is known yet", () => {
    expect(revealScoreColumns({ itemCount: true }, [])).toBeNull();
  });

  it("reveals score columns the stored state holds but the page does not", () => {
    // `offPage` is persisted `false` from a previous session and is not among
    // the ids the current page produced. The migration runs once, so missing it
    // here would hide it for good.
    expect(
      revealScoreColumns(
        {
          itemCount: true,
          "Trace-groundedness-EVAL-NUMERIC": false,
          "Trace-offPage-API-BOOLEAN": false,
          "accuracy-ANNOTATION-CATEGORICAL": false,
        },
        ["Trace-groundedness-EVAL-NUMERIC"],
      ),
    ).toEqual({
      itemCount: true,
      "Trace-groundedness-EVAL-NUMERIC": true,
      "Trace-offPage-API-BOOLEAN": true,
      "accuracy-ANNOTATION-CATEGORICAL": true,
    });
  });

  it("leaves a layout alone once any score column is enabled", () => {
    const curated = {
      "Trace-groundedness-EVAL-NUMERIC": false,
      "Trace-offPage-API-BOOLEAN": true,
    };
    expect(
      revealScoreColumns(curated, ["Trace-groundedness-EVAL-NUMERIC"]),
    ).toBe(curated);
  });

  it("does not mistake an ordinary column id for a score column", () => {
    expect(
      revealScoreColumns({ startTime: false, "expected-output": false }, [
        "Trace-groundedness-EVAL-NUMERIC",
      ]),
    ).toEqual({
      startTime: false,
      "expected-output": false,
      "Trace-groundedness-EVAL-NUMERIC": true,
    });
  });
});
