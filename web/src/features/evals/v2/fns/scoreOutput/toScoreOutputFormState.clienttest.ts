import { describe, expect, it } from "vitest";
import { ScoreDataTypeEnum } from "@langfuse/shared";

import { buildScoreOutputDefinition } from "./buildScoreOutputDefinition";
import { toScoreOutputFormState } from "./toScoreOutputFormState";

describe("toScoreOutputFormState", () => {
  it("defaults an absent output definition to a zero-to-one numeric score", () => {
    const formState = toScoreOutputFormState(null);

    expect(formState).toMatchObject({
      dataType: ScoreDataTypeEnum.NUMERIC,
      scoreDescription: "",
      reasoningDescription: "",
      minValue: "0",
      maxValue: "1",
    });
    expect(buildScoreOutputDefinition(formState)).toMatchObject({
      score: {
        description:
          "Tell the judge what the score represents and how to assign it.",
      },
      reasoning: {
        description:
          "Tell the judge what to explain when justifying its score.",
      },
    });
  });

  it("preserves numeric score bounds across serialization", () => {
    const formState = toScoreOutputFormState(null);
    const outputDefinition = buildScoreOutputDefinition({
      ...formState,
      minValue: "-1.5",
      maxValue: "2.5",
    });

    expect(outputDefinition).toMatchObject({
      score: {
        minValue: -1.5,
        maxValue: 2.5,
      },
    });
    expect(toScoreOutputFormState(outputDefinition)).toMatchObject({
      minValue: "-1.5",
      maxValue: "2.5",
    });
  });

  it("preserves whether a categorical score allows multiple matches", () => {
    const formState = toScoreOutputFormState({
      version: 2,
      dataType: ScoreDataTypeEnum.CATEGORICAL,
      score: {
        description: "Applicable topics",
        categories: ["Billing", "Technical"],
        shouldAllowMultipleMatches: true,
      },
      reasoning: { description: "Explain the selected topics" },
    });

    expect(formState.shouldAllowMultipleMatches).toBe(true);
    expect(buildScoreOutputDefinition(formState)).toMatchObject({
      score: { shouldAllowMultipleMatches: true },
    });
  });
});
