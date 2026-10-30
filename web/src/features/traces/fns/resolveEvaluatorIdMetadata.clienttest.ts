import { describe, expect, it } from "vitest";

import { resolveEvaluatorIdMetadata } from "./resolveEvaluatorIdMetadata";

describe("resolveEvaluatorIdMetadata", () => {
  it("resolves evaluator ids from serialized observation metadata", () => {
    expect(
      resolveEvaluatorIdMetadata(
        JSON.stringify({ evaluator_id: "evaluator-id" }),
      ),
    ).toBe("evaluator-id");
  });
});
