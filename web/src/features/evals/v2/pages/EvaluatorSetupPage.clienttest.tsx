import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { getEvaluatorNameStep } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/evaluatorSetupSteps";
import {
  applyEvaluatorSuggestion,
  getEvaluatorExecutionTracePeekConfig,
  getEvaluatorSamplePeekConfig,
  getEvaluatorVersionDefinition,
  openEvaluatorSamplePeek,
  restoreEvaluatorVersion,
  shouldOfferRuleAttachment,
} from "./EvaluatorSetupPage";

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    push: mockPush,
    pathname: "/project/[projectId]/evals/new",
  }),
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

describe("evaluator sample peek navigation", () => {
  beforeEach(() => {
    mockPush.mockReset();
    window.history.replaceState(
      {},
      "",
      "/project/project-1/evals/new?template=scratch",
    );
  });

  it("opens the trace peek focused on the clicked observation", () => {
    const observation = {
      id: "observation-child",
      traceId: "trace-1",
      startTime: new Date("2026-09-30T12:00:00.000Z"),
    };
    const { result } = renderHook(() =>
      usePeekNavigation(getEvaluatorSamplePeekConfig("project-1")),
    );

    openEvaluatorSamplePeek(result.current, observation);

    expect(mockPush).toHaveBeenCalledWith(
      {
        pathname: "/project/project-1/evals/new",
        query: {
          template: "scratch",
          peek: "observation-child",
          observation: "observation-child",
          traceId: "trace-1",
          timestamp: "2026-09-30T12:00:00.000Z",
        },
      },
      undefined,
      { shallow: true },
    );
  });

  it("opens evaluator execution traces without selecting an observation", () => {
    const { result } = renderHook(() =>
      usePeekNavigation(getEvaluatorExecutionTracePeekConfig("project-1")),
    );

    result.current.openPeek("trace-1");

    expect(mockPush).toHaveBeenCalledWith(
      {
        pathname: "/project/project-1/evals/new",
        query: {
          template: "scratch",
          peek: "trace-1",
        },
      },
      undefined,
      { shallow: true },
    );
  });

  it("navigates between trace details without treating trace ids as observation ids", () => {
    const { result } = renderHook(() =>
      usePeekNavigation(getEvaluatorSamplePeekConfig("project-1")),
    );

    const target = result.current.resolveDetailNavigationPath({
      id: "trace-2",
      params: { timestamp: "2026-09-30T13:00:00.000Z" },
    });
    const params = new URL(target, window.location.origin).searchParams;

    expect(params.get("peek")).toBe("trace-2");
    expect(params.get("observation")).toBeNull();
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
