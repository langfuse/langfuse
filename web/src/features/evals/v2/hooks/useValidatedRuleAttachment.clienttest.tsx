import { act, renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  attachMutation: vi.fn(),
  capture: vi.fn(),
  configByIdInvalidate: vi.fn(),
  evalsV2Invalidate: vi.fn(),
  showSuccessToast: vi.fn(),
  validateAndAttachRule: vi.fn(),
}));

vi.mock("@/src/features/evals/v2/actions/validateAndAttachRule", () => ({
  validateAndAttachRule: mocks.validateAndAttachRule,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: mocks.showSuccessToast,
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
          ruleById: { query: vi.fn() },
          testRunCodeEval: { mutate: vi.fn() },
        },
        events: { all: { query: vi.fn() } },
      },
      evals: {
        configById: { invalidate: mocks.configByIdInvalidate },
      },
      evalsV2: { invalidate: mocks.evalsV2Invalidate },
    }),
    evalsV2: {
      attachEvaluatorToRule: {
        useMutation: () => ({ mutateAsync: mocks.attachMutation }),
      },
    },
  },
}));

import { useValidatedRuleAttachment } from "./useValidatedRuleAttachment";

const attachment = {
  evaluatorId: "evaluator-1",
  ruleId: "rule-1",
  evaluatorName: "Quality",
  evaluationRuleName: "Production",
};

describe("useValidatedRuleAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attachMutation.mockResolvedValue(undefined);
    mocks.configByIdInvalidate.mockResolvedValue(undefined);
    mocks.evalsV2Invalidate.mockResolvedValue(undefined);
    mocks.validateAndAttachRule.mockImplementation(
      async (
        _projectId: string,
        dependencies: { attach: () => Promise<unknown> },
      ) => {
        await dependencies.attach();
        return {
          attached: true,
          issue: {
            outcome: "failed",
            message: "The evaluator test failed.",
          },
        };
      },
    );
  });

  it("attaches immediately and exposes a dismissible validation warning", async () => {
    const { result } = renderHook(() =>
      useValidatedRuleAttachment({
        projectId: "project-1",
        entryPoint: "evaluator_detail",
      }),
    );

    await act(async () => {
      await result.current.attach(attachment);
    });

    expect(result.current.issue).toEqual({
      ...attachment,
      outcome: "failed",
      message: "The evaluator test failed.",
    });
    expect(mocks.attachMutation).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      ruleId: "rule-1",
    });
    expect(mocks.configByIdInvalidate).toHaveBeenCalledWith({
      projectId: "project-1",
      id: "evaluator-1",
    });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "Evaluator attached",
      description: "“Quality” is now attached to “Production”.",
    });
  });

  it("dismisses a validation warning without undoing the attachment", async () => {
    const { result } = renderHook(() =>
      useValidatedRuleAttachment({
        projectId: "project-1",
        entryPoint: "evaluator_detail",
      }),
    );

    await act(async () => {
      await result.current.attach(attachment);
    });
    act(() => result.current.dismissIssue());

    expect(result.current.issue).toBeNull();
    expect(mocks.attachMutation).toHaveBeenCalledOnce();
  });
});
