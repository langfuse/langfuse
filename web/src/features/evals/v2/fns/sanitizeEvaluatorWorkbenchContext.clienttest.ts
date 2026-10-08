// @vitest-environment node

import { sanitizeEvaluatorWorkbenchContext } from "./sanitizeEvaluatorWorkbenchContext";

const validContext = {
  description: "evaluator_workbench",
  value: JSON.stringify({
    projectId: "project-1",
    evaluatorId: "evaluator-1",
    mode: "create",
    evaluatorType: "LLM_AS_JUDGE",
    sampleFilter: [
      {
        type: "stringOptions",
        column: "type",
        operator: "any of",
        value: ["GENERATION"],
        ignored: "strip me",
      },
    ],
    selectedObservation: {
      observationId: "observation-1",
      traceId: "trace-1",
      startTime: "2026-09-03T07:45:00.000Z",
      input: "never expose me",
    },
    draft: {
      variables: ["answer"],
      mappings: [
        {
          variable: "answer",
          selectedColumnId: "output",
          jsonSelector: "response.text",
          rawValue: "never expose me",
        },
      ],
      prompt: "never expose me",
    },
    unknown: "strip me",
  }),
};

describe("sanitizeEvaluatorWorkbenchContext", () => {
  it("keeps bounded workbench metadata and strips unknown or raw fields", () => {
    const sanitized = sanitizeEvaluatorWorkbenchContext(
      [validContext],
      "project-1",
    );

    expect(sanitized?.description).toBe("evaluator_workbench");
    expect(JSON.parse(sanitized?.value ?? "")).toEqual({
      evaluatorId: "evaluator-1",
      mode: "create",
      evaluatorType: "LLM_AS_JUDGE",
      sampleFilter: [
        {
          type: "stringOptions",
          column: "type",
          operator: "any of",
          value: ["GENERATION"],
        },
      ],
      selectedObservation: {
        observationId: "observation-1",
        traceId: "trace-1",
        startTime: "2026-09-03T07:45:00.000Z",
      },
      draft: {
        variables: ["answer"],
        mappings: [
          {
            variable: "answer",
            selectedColumnId: "output",
            jsonSelector: "response.text",
          },
        ],
      },
    });
  });

  it("rejects project mismatches and malformed or oversized filters", () => {
    expect(
      sanitizeEvaluatorWorkbenchContext(
        [
          {
            ...validContext,
            value: validContext.value.replace("project-1", "project-2"),
          },
        ],
        "project-1",
      ),
    ).toBeNull();

    const parsed = JSON.parse(validContext.value);
    parsed.sampleFilter = [{ type: "string", column: "name" }];
    expect(
      sanitizeEvaluatorWorkbenchContext(
        [{ ...validContext, value: JSON.stringify(parsed) }],
        "project-1",
      ),
    ).toBeNull();

    parsed.sampleFilter = Array.from({ length: 21 }, () => ({
      type: "stringOptions",
      column: "type",
      operator: "any of",
      value: ["GENERATION"],
    }));
    expect(
      sanitizeEvaluatorWorkbenchContext(
        [{ ...validContext, value: JSON.stringify(parsed) }],
        "project-1",
      ),
    ).toBeNull();
  });
});
