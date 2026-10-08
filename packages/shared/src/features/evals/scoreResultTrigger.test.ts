import { describe, expect, it } from "vitest";
import {
  matchesScoreResultTrigger,
  ScoreResultTriggerSchema,
} from "./scoreResultTrigger";

describe("score result triggers", () => {
  it("matches all predicates against scores from one execution", () => {
    const trigger = ScoreResultTriggerSchema.parse({
      evaluatorId: "evaluator-1",
      predicates: [
        {
          scoreName: "toxicity",
          dataType: "BOOLEAN",
          operator: "=",
          value: false,
        },
        {
          scoreName: "relevance",
          dataType: "NUMERIC",
          operator: "<",
          value: 0.5,
        },
      ],
    });

    expect(
      matchesScoreResultTrigger(trigger, [
        { name: "toxicity", dataType: "BOOLEAN", value: 0 },
        { name: "relevance", dataType: "NUMERIC", value: 0.4 },
      ]),
    ).toBe(true);
    expect(
      matchesScoreResultTrigger(trigger, [
        { name: "toxicity", dataType: "BOOLEAN", value: 0 },
      ]),
    ).toBe(false);
  });

  it("does not combine duplicate score names across returned scores", () => {
    const trigger = ScoreResultTriggerSchema.parse({
      evaluatorId: "evaluator-1",
      predicates: [
        {
          scoreName: "quality",
          dataType: "NUMERIC",
          operator: ">",
          value: 0.2,
        },
        {
          scoreName: "quality",
          dataType: "NUMERIC",
          operator: "<",
          value: 0.8,
        },
      ],
    });

    expect(
      matchesScoreResultTrigger(trigger, [
        { name: "quality", dataType: "NUMERIC", value: 0.9 },
        { name: "quality", dataType: "NUMERIC", value: 0.1 },
      ]),
    ).toBe(false);
    expect(
      matchesScoreResultTrigger(trigger, [
        { name: "quality", dataType: "NUMERIC", value: 0.5 },
      ]),
    ).toBe(true);
  });

  it("supports categorical and text equality predicates", () => {
    const trigger = ScoreResultTriggerSchema.parse({
      evaluatorId: "evaluator-1",
      predicates: [
        {
          scoreName: "label",
          dataType: "CATEGORICAL",
          operator: "!=",
          value: "unsafe",
        },
        {
          scoreName: "reason",
          dataType: "TEXT",
          operator: "=",
          value: "accepted",
        },
      ],
    });

    expect(
      matchesScoreResultTrigger(trigger, [
        { name: "label", dataType: "CATEGORICAL", value: "safe" },
        { name: "reason", dataType: "TEXT", value: "accepted" },
      ]),
    ).toBe(true);
  });

  it("infers omitted code evaluator score types from their values", () => {
    expect(
      matchesScoreResultTrigger(
        ScoreResultTriggerSchema.parse({
          evaluatorId: "evaluator-1",
          predicates: [
            {
              scoreName: "quality",
              dataType: "NUMERIC",
              operator: ">=",
              value: 0.8,
            },
          ],
        }),
        [{ name: "quality", value: 0.9 }],
      ),
    ).toBe(true);

    expect(
      matchesScoreResultTrigger(
        ScoreResultTriggerSchema.parse({
          evaluatorId: "evaluator-1",
          predicates: [
            {
              scoreName: "label",
              dataType: "CATEGORICAL",
              operator: "=",
              value: "safe",
            },
          ],
        }),
        [{ name: "label", value: "safe" }],
      ),
    ).toBe(true);
  });
});
