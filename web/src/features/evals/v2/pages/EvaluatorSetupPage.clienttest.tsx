import { describe, expect, it, vi } from "vitest";

import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import {
  applyEvaluatorSuggestion,
  getEvaluatorVersionDefinition,
  navigateToEvaluatorDetail,
  restoreEvaluatorVersion,
  shouldOfferRuleAttachment,
} from "./EvaluatorSetupPage";

describe("navigateToEvaluatorDetail", () => {
  it("warms evaluator data and the route before replacing the page", async () => {
    const callOrder: string[] = [];
    const prefetchEvaluator = vi.fn(async () => {
      callOrder.push("evaluator");
    });
    const prefetchRoute = vi.fn(async () => {
      callOrder.push("route");
    });
    const replace = vi.fn(async () => {
      callOrder.push("replace");
      return true;
    });

    await navigateToEvaluatorDetail({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      prefetchEvaluator,
      prefetchRoute,
      replace,
    });

    const path = "/project/project-1/evals/evaluator-1";
    expect(prefetchEvaluator).toHaveBeenCalledOnce();
    expect(prefetchRoute).toHaveBeenCalledWith(path);
    expect(replace).toHaveBeenCalledWith(path);
    expect(callOrder.at(-1)).toBe("replace");
  });

  it("waits for remaining warm-ups when one prefetch fails", async () => {
    let finishRoutePrefetch: () => void = () => undefined;
    const prefetchRoute = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRoutePrefetch = resolve;
        }),
    );
    const replace = vi.fn(async () => true);
    const navigation = navigateToEvaluatorDetail({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      prefetchEvaluator: async () => {
        throw new Error("prefetch failed");
      },
      prefetchRoute,
      replace,
    });

    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();

    finishRoutePrefetch();
    await navigation;
    expect(replace).toHaveBeenCalledWith(
      "/project/project-1/evals/evaluator-1",
    );
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
