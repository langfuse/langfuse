import { describe, expect, it, vi } from "vitest";

import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { getEvaluatorNameStep } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/evaluatorSetupSteps";
import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";
import { managedTemplateToEvaluatorSetupDraft } from "@/src/features/evals/v2/fns/templateGallery/managedTemplateToEvaluatorSetupDraft";
import {
  applyEvaluatorSuggestion,
  getEvaluatorAssistantLandingMode,
  getEvaluatorSetupHeaderState,
  getEvaluatorVersionDefinition,
  navigateToEvaluatorDetail,
  openEvaluatorAssistantLanding,
  restoreEvaluatorVersion,
  shouldOfferRuleAttachment,
} from "./EvaluatorSetupPage";

describe("getEvaluatorSetupHeaderState", () => {
  it("does not expose an Assistant action in the page header", () => {
    expect(getEvaluatorSetupHeaderState()).toEqual({
      title: "Configure evaluator",
    });
  });
});

describe("getEvaluatorAssistantLandingMode", () => {
  it.each([
    {
      name: "scratch code creation",
      input: {
        mode: "create",
        evaluatorType: "CODE",
        isAssistantAvailable: true,
      },
      expected: "create",
    },
    {
      name: "scratch judge creation",
      input: {
        mode: "create",
        evaluatorType: "LLM_AS_JUDGE",
        isAssistantAvailable: true,
      },
      expected: "create",
    },
    {
      name: "existing evaluator",
      input: {
        mode: "edit",
        evaluatorType: "CODE",
        isAssistantAvailable: true,
      },
      expected: "edit",
    },
    {
      name: "Decision Model creation",
      input: {
        mode: "create",
        evaluatorType: "DECISION_MODEL",
        isAssistantAvailable: true,
      },
      expected: "create",
    },
    {
      name: "Decision Model editing",
      input: {
        mode: "edit",
        evaluatorType: "DECISION_MODEL",
        isAssistantAvailable: true,
      },
      expected: "edit",
    },
    {
      name: "template LLM judge creation",
      input: {
        mode: "create",
        evaluatorType: "LLM_AS_JUDGE",
        isAssistantAvailable: true,
      },
      expected: "create",
    },
    {
      name: "template code creation",
      input: {
        mode: "create",
        evaluatorType: "CODE",
        isAssistantAvailable: true,
      },
      expected: "create",
    },
    {
      name: "unavailable Assistant",
      input: {
        mode: "edit",
        evaluatorType: "LLM_AS_JUDGE",
        isAssistantAvailable: false,
      },
      expected: null,
    },
  ] as const)("$name resolves to $expected", ({ input, expected }) => {
    expect(getEvaluatorAssistantLandingMode(input)).toBe(expected);
  });
});

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

  it("resets before every repeated footer click", () => {
    const callOrder: string[] = [];
    const open = () =>
      openEvaluatorAssistantLanding({
        selectConversation: () => callOrder.push("reset"),
        activateLanding: () => {
          callOrder.push("activate");
          return true;
        },
        openAssistant: () => {
          callOrder.push("open");
          return true;
        },
        clearLanding: () => callOrder.push("clear"),
      });

    expect(open()).toBe(true);
    expect(open()).toBe(true);
    expect(callOrder).toEqual([
      "reset",
      "activate",
      "open",
      "reset",
      "activate",
      "open",
    ]);
  });

  it("cleans up when the landing cannot activate", () => {
    const callOrder: string[] = [];

    expect(
      openEvaluatorAssistantLanding({
        selectConversation: () => callOrder.push("reset"),
        activateLanding: () => {
          callOrder.push("activate");
          return false;
        },
        openAssistant: () => {
          callOrder.push("open");
          return true;
        },
        clearLanding: () => callOrder.push("clear"),
      }),
    ).toBe(false);
    expect(callOrder).toEqual(["reset", "activate", "clear"]);
  });

  it("clears the landing when the Assistant cannot open", () => {
    const clearLanding = vi.fn();

    expect(
      openEvaluatorAssistantLanding({
        selectConversation: vi.fn(),
        activateLanding: () => true,
        openAssistant: () => false,
        clearLanding,
      }),
    ).toBe(false);
    expect(clearLanding).toHaveBeenCalledOnce();
  });

  it.each([
    ["answer-relevance", "LLM_AS_JUDGE"],
    ["exact-match", "CODE"],
  ] as const)(
    "does not reset the %s template draft when opening its landing",
    (templateKey, expectedType) => {
      const template = MANAGED_TEMPLATES_CATALOG.templates.find(
        ({ key }) => key === templateKey,
      );
      expect(template).toBeDefined();
      const draft = managedTemplateToEvaluatorSetupDraft(template!);
      const store = createEvaluatorSetupStore({
        initialEvaluator: draft,
        mode: "create",
      });
      const snapshot = JSON.stringify(store.getState(), (key, value) =>
        key === "actions" ? undefined : value,
      );

      expect(
        openEvaluatorAssistantLanding({
          selectConversation: vi.fn(),
          activateLanding: () => true,
          openAssistant: () => true,
          clearLanding: vi.fn(),
        }),
      ).toBe(true);

      expect(store.getState().type).toBe(expectedType);
      expect(
        JSON.stringify(store.getState(), (key, value) =>
          key === "actions" ? undefined : value,
        ),
      ).toBe(snapshot);
    },
  );

  it("preserves a custom judge template's prompt, output, mappings, model, and metadata", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: {
        name: "Template judge",
        description: "Judge from a project evaluator template",
        definition: {
          type: "LLM_AS_JUDGE",
          promptMessages: [
            { role: "system", content: "Use this rubric" },
            { role: "user", content: "Judge {{answer}}" },
          ],
          provider: "openai",
          model: "gpt-4.1-mini",
          modelParams: { temperature: 0.2 },
          vars: ["answer"],
          variableMapping: [
            {
              templateVariable: "answer",
              selectedColumnId: "output",
              jsonSelector: "response.text",
            },
          ],
          outputDefinition: {
            dataType: "NUMERIC",
            score: {
              description: "Answer quality",
              minValue: 1,
              maxValue: 5,
            },
            reasoning: { description: "Explain the score" },
          },
        },
      },
      mode: "create",
    });
    const snapshot = JSON.stringify(store.getState(), (key, value) =>
      key === "actions" ? undefined : value,
    );

    openEvaluatorAssistantLanding({
      selectConversation: vi.fn(),
      activateLanding: () => true,
      openAssistant: () => true,
      clearLanding: vi.fn(),
    });

    expect(
      JSON.stringify(store.getState(), (key, value) =>
        key === "actions" ? undefined : value,
      ),
    ).toBe(snapshot);
  });
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

describe("shouldOfferRuleAttachment", () => {
  it("does not offer rule attachment for a blocked evaluator", () => {
    expect(shouldOfferRuleAttachment({ blockedAt: new Date() })).toBe(false);
  });

  it("offers rule attachment for an active evaluator", () => {
    expect(shouldOfferRuleAttachment({ blockedAt: null })).toBe(true);
  });
});

describe("getEvaluatorNameStep", () => {
  it.each([
    ["CODE", 2],
    ["LLM_AS_JUDGE", 3],
    ["DECISION_MODEL", 3],
  ] as const)("%s evaluators use step %i", (type, step) => {
    expect(getEvaluatorNameStep(type)).toBe(step);
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
