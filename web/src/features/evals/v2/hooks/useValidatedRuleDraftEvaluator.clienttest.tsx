import { act, renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  validateRuleAttachment: vi.fn(),
  eventsAll: vi.fn(),
  sampleObservation: vi.fn(),
}));

vi.mock("@/src/features/evals/v2/actions/validateAndAttachRule", () => ({
  validateRuleAttachment: mocks.validateRuleAttachment,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      client: {
        evals: { configById: { query: vi.fn() } },
        evalsV2: {
          sampleObservation: { query: mocks.sampleObservation },
          testRunCodeEval: { mutate: vi.fn() },
        },
        events: { all: { query: mocks.eventsAll } },
      },
    }),
  },
}));

import { useValidatedRuleDraftEvaluator } from "./useValidatedRuleDraftEvaluator";

describe("useValidatedRuleDraftEvaluator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventsAll.mockResolvedValue({
      observations: [
        {
          id: "observation-1",
          traceId: "trace-1",
          startTime: new Date("2026-07-20T08:00:00.000Z"),
        },
      ],
    });
    mocks.sampleObservation.mockResolvedValue({
      id: "observation-1",
      traceId: "trace-1",
      startTime: new Date("2026-07-20T08:00:00.000Z"),
      input: { question: "What is Langfuse?" },
      output: { answer: "An LLM engineering platform." },
      metadata: { environment: "production" },
    });
  });

  it("hydrates the latest matching observation before validating mappings", async () => {
    let validatedSample: unknown;
    mocks.validateRuleAttachment.mockImplementation(
      async (
        _projectId: string,
        dependencies: {
          getSample: (filter: unknown[]) => Promise<unknown>;
        },
      ) => {
        validatedSample = await dependencies.getSample([]);
        return { valid: true };
      },
    );
    const { result } = renderHook(() =>
      useValidatedRuleDraftEvaluator({ projectId: "project-1" }),
    );

    await act(async () => {
      await result.current.validate({
        evaluatorId: "evaluator-1",
        filter: [],
        mapping: [
          {
            templateVariable: "input",
            selectedColumnId: "input",
            jsonSelector: null,
          },
        ],
      });
    });

    expect(mocks.sampleObservation).toHaveBeenCalledWith({
      projectId: "project-1",
      observationId: "observation-1",
      traceId: "trace-1",
      startTime: new Date("2026-07-20T08:00:00.000Z"),
    });
    expect(validatedSample).toEqual(
      expect.objectContaining({
        input: { question: "What is Langfuse?" },
        output: { answer: "An LLM engineering platform." },
        metadata: { environment: "production" },
      }),
    );
  });
});
