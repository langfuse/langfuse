import { describe, expect, it } from "vitest";

import {
  CreateAnnotationScoreData,
  UpdateAnnotationScoreData,
} from "@langfuse/shared";

// Pins a deliberate decision in the BOOLEAN branch of the annotation score
// schemas (packages/shared/src/features/annotation/types.ts): `value` is
// derived from the label, so an inconsistent pair like
// { stringValue: "True", value: 0 } cannot make the numeric (scores_avg)
// and boolean (score_booleans) filter paths disagree on the same score.
describe("annotation boolean score schema", () => {
  const base = {
    name: "is_correct",
    projectId: "project-id",
    scoreTarget: { type: "trace", traceId: "trace-id" },
    configId: "config-id",
    dataType: "BOOLEAN",
  } as const;

  it("derives value from the label on create", () => {
    const parsed = CreateAnnotationScoreData.parse({
      ...base,
      stringValue: "False",
      value: 1,
    });

    expect(parsed.stringValue).toBe("False");
    expect(parsed.value).toBe(0);
  });

  it("derives value on update, overriding an inconsistent input value", () => {
    const parsed = UpdateAnnotationScoreData.parse({
      ...base,
      id: "score-id",
      stringValue: "True",
      value: 0,
    });

    expect(parsed.stringValue).toBe("True");
    expect(parsed.value).toBe(1);
  });

  it("rejects labels other than the exact config-enforced True/False", () => {
    for (const stringValue of ["yes", "", "true", "false"]) {
      expect(() =>
        CreateAnnotationScoreData.parse({
          ...base,
          stringValue,
          value: 1,
        }),
      ).toThrow();
    }
  });
});
