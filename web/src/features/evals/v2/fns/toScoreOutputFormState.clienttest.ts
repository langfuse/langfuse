import { describe, expect, it } from "vitest";
import { ScoreDataTypeEnum } from "@langfuse/shared";

import { toScoreOutputFormState } from "./toScoreOutputFormState";

describe("toScoreOutputFormState", () => {
  it("defaults an absent output definition to a zero-to-one numeric score", () => {
    expect(toScoreOutputFormState(null)).toMatchObject({
      dataType: ScoreDataTypeEnum.NUMERIC,
      minValue: "0",
      maxValue: "1",
    });
  });
});
