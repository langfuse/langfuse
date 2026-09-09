import { startJudgeEvaluatorAssistantHandoff } from "./startJudgeEvaluatorAssistantHandoff";

describe("startJudgeEvaluatorAssistantHandoff", () => {
  it("persists before submitting a structured judge update", async () => {
    const callOrder: string[] = [];
    const submitToAssistant = vi.fn(async (prompt: string) => {
      callOrder.push("submit");
      expect(prompt).toContain('evaluator ID "evaluator-1"');
      expect(prompt).toContain("pass promptMessages");
      expect(prompt).toContain('observationId: "observation-1"');
      return true;
    });

    await expect(
      startJudgeEvaluatorAssistantHandoff({
        request: "Score from one to five",
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
      entryPoint: "judge-evaluator-editor",
    });
  });

  it("does not submit when the evaluator cannot be persisted", async () => {
    const submitToAssistant = vi.fn();

    await expect(
      startJudgeEvaluatorAssistantHandoff({
        request: "Score from one to five",
        conversationId: "conversation-1",
        openAssistant: () => true,
        persistEvaluator: async () => null,
        submitToAssistant,
      }),
    ).resolves.toBeNull();

    expect(submitToAssistant).not.toHaveBeenCalled();
  });
});
