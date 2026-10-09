import { describe, expect, it, vi } from "vitest";

import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import {
  navigateToEvaluatorDetail,
  openEvaluatorAssistantLanding,
  restoreEvaluatorVersion,
} from "./EvaluatorSetupPage";

describe("openEvaluatorAssistantLanding", () => {
  it("resets an existing selection before activating the landing and opening", () => {
    const callOrder: string[] = [];
    let selectedConversationId: string | null = "existing-conversation";

    expect(
      openEvaluatorAssistantLanding({
        selectConversation: (conversationId) => {
          selectedConversationId = conversationId;
          callOrder.push("reset");
        },
        activateLanding: () => {
          expect(selectedConversationId).toBeNull();
          callOrder.push("activate");
          return true;
        },
        openAssistant: () => {
          expect(selectedConversationId).toBeNull();
          callOrder.push("open");
          return true;
        },
        clearLanding: () => callOrder.push("clear"),
      }),
    ).toBe(true);
    expect(callOrder).toEqual(["reset", "activate", "open"]);
  });

  it.each([
    {
      name: "landing activation fails",
      activateLanding: () => false,
      openAssistant: () => true,
      expectedOrder: ["reset", "activate", "clear"],
    },
    {
      name: "Assistant opening fails",
      activateLanding: () => true,
      openAssistant: () => false,
      expectedOrder: ["reset", "activate", "open", "clear"],
    },
  ])(
    "cleans up when $name",
    ({ activateLanding, openAssistant, expectedOrder }) => {
      const callOrder: string[] = [];

      expect(
        openEvaluatorAssistantLanding({
          selectConversation: () => callOrder.push("reset"),
          activateLanding: () => {
            callOrder.push("activate");
            return activateLanding();
          },
          openAssistant: () => {
            callOrder.push("open");
            return openAssistant();
          },
          clearLanding: () => callOrder.push("clear"),
        }),
      ).toBe(false);
      expect(callOrder).toEqual(expectedOrder);
    },
  );
});

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

describe("restoreEvaluatorVersion", () => {
  it.each([
    {
      name: "code",
      version: {
        type: "CODE" as const,
        promptMessages: null,
        sourceCode: "return { score: 1 };",
        sourceCodeLanguage: "TYPESCRIPT" as const,
        provider: null,
        model: null,
        modelParams: null,
        vars: [],
        variableMapping: null,
        outputDefinition: null,
      },
      expectedDefinition: {
        type: "CODE",
        sourceCode: "return { score: 1 };",
      },
    },
    {
      name: "LLM-as-a-judge",
      version: {
        type: "LLM_AS_JUDGE" as const,
        promptMessages: [
          { role: "user" as const, content: "Judge {{output}}" },
        ],
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
        outputDefinition: {
          version: 2 as const,
          dataType: "NUMERIC" as const,
          score: { description: "Answer quality", minValue: 0, maxValue: 1 },
          reasoning: { description: "Explain the score" },
        },
        sourceCode: null,
        sourceCodeLanguage: null,
      },
      expectedDefinition: {
        type: "LLM_AS_JUDGE",
        promptMessages: [{ role: "user", content: "Judge {{output}}" }],
        selectedModel: { provider: "openai", model: "gpt-4.1-mini" },
        modelParams: { temperature: 0.2 },
        variableFields: {
          output: { selectedColumnId: "output", jsonSelector: null },
        },
      },
    },
  ])(
    "restores a $name definition and clears stale test state",
    ({ version, expectedDefinition }) => {
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
          ...version,
        },
        resetTestState,
      });

      expect(store.getState()).toMatchObject(expectedDefinition);
      expect(resetTestState).toHaveBeenCalledOnce();
    },
  );
});
