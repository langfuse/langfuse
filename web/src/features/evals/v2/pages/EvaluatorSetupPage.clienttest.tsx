import { describe, expect, it, vi } from "vitest";

import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import {
  applyEvaluatorSuggestion,
  getCodeEvaluatorAssistantPrompt,
  getCodeEvaluatorAssistantSampleObservation,
  getEvaluatorVersionDefinition,
  restoreEvaluatorVersion,
  shouldOfferRuleAttachment,
  startCodeEvaluatorAssistantHandoff,
} from "./EvaluatorSetupPage";

describe("getCodeEvaluatorAssistantSampleObservation", () => {
  it("normalizes valid sample references", () => {
    expect(
      getCodeEvaluatorAssistantSampleObservation({
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
      getCodeEvaluatorAssistantSampleObservation({
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

describe("shouldOfferRuleAttachment", () => {
  it("does not offer rule attachment for a blocked evaluator", () => {
    expect(shouldOfferRuleAttachment({ blockedAt: new Date() })).toBe(false);
  });

  it("offers rule attachment for an active evaluator", () => {
    expect(shouldOfferRuleAttachment({ blockedAt: null })).toBe(true);
  });
});

describe("getEvaluatorVersionDefinition", () => {
  it("rebuilds an LLM definition from a saved version", () => {
    const outputDefinition = {
      version: 2 as const,
      dataType: "NUMERIC" as const,
      score: { description: "Answer quality", minValue: 0, maxValue: 1 },
      reasoning: { description: "Explain the score" },
    };

    expect(
      getEvaluatorVersionDefinition({
        id: "version-1",
        version: 1,
        createdAt: new Date(),
        createdByUser: null,
        type: "LLM_AS_JUDGE",
        promptMessages: [{ role: "user", content: "Judge {{output}}" }],
        provider: "openai",
        model: "gpt-4.1-mini",
        modelParams: { temperature: 0.2 },
        vars: ["output"],
        variableMapping: [
          {
            templateVariable: "output",
            selectedColumnId: "output",
            jsonSelector: null,
          },
        ],
        outputDefinition,
        sourceCode: null,
        sourceCodeLanguage: null,
      }),
    ).toMatchObject({
      type: "LLM_AS_JUDGE",
      promptMessages: [{ role: "user", content: "Judge {{output}}" }],
      provider: "openai",
      model: "gpt-4.1-mini",
      modelParams: { temperature: 0.2 },
      vars: ["output"],
      outputDefinition,
    });
  });
});

describe("restoreEvaluatorVersion", () => {
  it("clears stale test state after loading the saved definition", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const resetTestState = vi.fn();

    restoreEvaluatorVersion({
      store,
      version: {
        id: "version-1",
        version: 1,
        createdAt: new Date(),
        createdByUser: null,
        type: "CODE",
        promptMessages: null,
        sourceCode: "return { score: 1 };",
        sourceCodeLanguage: "TYPESCRIPT",
        provider: null,
        model: null,
        modelParams: null,
        vars: [],
        variableMapping: null,
        outputDefinition: null,
      },
      resetTestState,
    });

    expect(store.getState()).toMatchObject({
      type: "CODE",
      sourceCode: "return { score: 1 };",
    });
    expect(resetTestState).toHaveBeenCalledOnce();
  });
});

describe("applyEvaluatorSuggestion", () => {
  it("reports when generation returns no suggestion", () => {
    const setSuggestion = vi.fn();

    expect(applyEvaluatorSuggestion(null, setSuggestion)).toBe(false);
    expect(setSuggestion).not.toHaveBeenCalled();
  });

  it("applies a generated suggestion", () => {
    const setSuggestion = vi.fn();

    expect(applyEvaluatorSuggestion("Quality judge", setSuggestion)).toBe(true);
    expect(setSuggestion).toHaveBeenCalledWith("Quality judge");
  });
});
