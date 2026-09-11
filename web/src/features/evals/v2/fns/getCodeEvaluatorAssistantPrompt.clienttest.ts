import { getCodeEvaluatorAssistantPrompt } from "./getCodeEvaluatorAssistantPrompt";

describe("getCodeEvaluatorAssistantPrompt", () => {
  it("targets the persisted evaluator and selected sample by id", () => {
    const prompt = getCodeEvaluatorAssistantPrompt({
      evaluatorId: "evaluator-1",
      request: "Return zero for empty outputs",
      sampleObservation: {
        observationId: "observation-1",
        traceId: "trace-1",
        startTime: "2026-09-02T07:30:00.000Z",
      },
    });

    expect(prompt).toContain('evaluator ID "evaluator-1"');
    expect(prompt).toContain("Return zero for empty outputs");
    expect(prompt).toContain("Do not create a new evaluator");
    expect(prompt).toContain('observationId: "observation-1"');
    expect(prompt).toContain('traceId: "trace-1"');
    expect(prompt).toContain('startTime: "2026-09-02T07:30:00.000Z"');
    expect(prompt).toContain("test the updated evaluator");
    expect(prompt).toContain("do not set silent mode");
  });

  it("does not claim a sample is selected when none is available", () => {
    const prompt = getCodeEvaluatorAssistantPrompt({
      evaluatorId: "evaluator-1",
      request: "Return zero for empty outputs",
      sampleObservation: null,
    });

    expect(prompt).not.toContain("test the updated evaluator");
    expect(prompt).not.toContain("observationId");
  });
});
