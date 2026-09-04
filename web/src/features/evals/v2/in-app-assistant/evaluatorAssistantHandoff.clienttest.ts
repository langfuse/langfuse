import {
  getCodeEvaluatorAssistantPrompt,
  getEvaluatorAssistantSampleObservation,
  startCodeEvaluatorAssistantHandoff,
} from "./evaluatorAssistantHandoff";

describe("getEvaluatorAssistantSampleObservation", () => {
  it("normalizes valid sample references", () => {
    expect(
      getEvaluatorAssistantSampleObservation({
        id: " observation-1 ",
        traceId: " trace-1 ",
        startTime: new Date("2026-09-02T07:30:00.000Z"),
      }),
    ).toEqual({
      observationId: "observation-1",
      traceId: "trace-1",
      startTime: "2026-09-02T07:30:00.000Z",
    });
  });

  it("omits malformed sample references", () => {
    expect(
      getEvaluatorAssistantSampleObservation({
        id: "",
        traceId: "trace-1",
        startTime: new Date("invalid"),
      }),
    ).toBeNull();
  });
});

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

describe("startCodeEvaluatorAssistantHandoff", () => {
  it("persists before submitting an update for that evaluator id", async () => {
    const callOrder: string[] = [];
    const submitToAssistant = vi.fn(async (prompt: string) => {
      callOrder.push("submit");
      expect(prompt).toContain('evaluator ID "evaluator-1"');
      expect(prompt).toContain('observationId: "observation-1"');
      return true;
    });

    await expect(
      startCodeEvaluatorAssistantHandoff({
        request: "Return zero for empty outputs",
        conversationId: "conversation-1",
        sampleObservation: {
          observationId: "observation-1",
          traceId: "trace-1",
          startTime: "2026-09-02T07:30:00.000Z",
        },
        openAssistant: () => true,
        persistEvaluator: async () => {
          callOrder.push("persist");
          return "evaluator-1";
        },
        submitToAssistant,
      }),
    ).resolves.toEqual({ evaluatorId: "evaluator-1", started: true });

    expect(callOrder).toEqual(["persist", "submit"]);
    expect(submitToAssistant).toHaveBeenCalledWith(expect.any(String), {
      newConversation: true,
      conversationId: "conversation-1",
      entryPoint: "code-evaluator-editor",
    });
  });

  it("does not submit when the evaluator cannot be persisted", async () => {
    const submitToAssistant = vi.fn();

    await expect(
      startCodeEvaluatorAssistantHandoff({
        request: "Return zero for empty outputs",
        conversationId: "conversation-1",
        openAssistant: () => true,
        persistEvaluator: async () => null,
        submitToAssistant,
      }),
    ).resolves.toBeNull();

    expect(submitToAssistant).not.toHaveBeenCalled();
  });
});
