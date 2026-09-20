import { describe, expect, it } from "vitest";
import { GetAnnotationQueuesQuery } from "@/src/features/public-api/types/annotation-queues";
import { ListEvaluationRulesQuery } from "@/src/features/public-api/types/evaluation/evaluationRules";
import { ListEvaluatorsQuery } from "@/src/features/public-api/types/evaluation/evaluators";
import { GetLlmConnectionsV1Query } from "@/src/features/public-api/types/llm-connections";
import { GetModelsV1Query } from "@/src/features/public-api/types/models";
import { GetScoreConfigsQuery } from "@/src/features/public-api/types/score-configs";

describe("natural-key list query schemas", () => {
  it.each([
    ["models", GetModelsV1Query],
    ["score configs", GetScoreConfigsQuery],
    ["LLM connections", GetLlmConnectionsV1Query],
    ["annotation queues", GetAnnotationQueuesQuery],
    ["evaluators", ListEvaluatorsQuery],
    ["evaluation rules", ListEvaluationRulesQuery],
  ])("accepts and preserves an exact name for %s", (_resource, schema) => {
    expect(schema.parse({ name: "Case-Sensitive Name" }).name).toBe(
      "Case-Sensitive Name",
    );
  });
});
