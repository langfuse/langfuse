import { startCodeEvaluatorAssistantHandoff } from "./startCodeEvaluatorAssistantHandoff";

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
