// @vitest-environment node

import {
  sanitizeSelectedEvaluatorSampleContext,
  SELECTED_EVALUATOR_SAMPLE_CONTEXT_DESCRIPTION,
} from "./evaluatorAssistantContext";

const validContext = {
  description: SELECTED_EVALUATOR_SAMPLE_CONTEXT_DESCRIPTION,
  value: JSON.stringify({
    projectId: "project-1",
    evaluatorId: "evaluator-1",
    observationId: "observation-1",
    traceId: "trace-1",
    startTime: "2026-09-03T07:45:00.000Z",
    input: "sensitive input",
    output: "sensitive output",
  }),
};

describe("evaluator Assistant context", () => {
  it("keeps canonical references and strips sample content", () => {
    expect(
      sanitizeSelectedEvaluatorSampleContext([validContext], "project-1"),
    ).toEqual({
      description: SELECTED_EVALUATOR_SAMPLE_CONTEXT_DESCRIPTION,
      value:
        '{"evaluatorId":"evaluator-1","observationId":"observation-1","traceId":"trace-1","startTime":"2026-09-03T07:45:00.000Z"}',
    });
  });

  it("drops malformed, cross-project, and duplicate context", () => {
    expect(
      sanitizeSelectedEvaluatorSampleContext(
        [
          {
            description: SELECTED_EVALUATOR_SAMPLE_CONTEXT_DESCRIPTION,
            value:
              '{"projectId":"project-1","evaluatorId":"","observationId":"observation-1"}',
          },
        ],
        "project-1",
      ),
    ).toBeNull();
    expect(
      sanitizeSelectedEvaluatorSampleContext(
        [
          {
            ...validContext,
            value: validContext.value.replace("project-1", "project-2"),
          },
        ],
        "project-1",
      ),
    ).toBeNull();
    expect(
      sanitizeSelectedEvaluatorSampleContext(
        [validContext, validContext],
        "project-1",
      ),
    ).toBeNull();
  });
});
