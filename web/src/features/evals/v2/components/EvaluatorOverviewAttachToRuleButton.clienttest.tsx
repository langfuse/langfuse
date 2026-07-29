import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  attach: vi.fn(),
  attachmentHook: vi.fn(),
}));

vi.mock("@/src/features/evals/v2/hooks/useValidatedRuleAttachment", () => ({
  useValidatedRuleAttachment: () => mocks.attachmentHook(),
}));

vi.mock(
  "@/src/features/evals/v2/components/CreateEvaluationRuleDialog",
  () => ({
    CreateEvaluationRuleDialog: () => null,
  }),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    evalsV2: {
      rules: {
        useQuery: () => ({
          data: [
            {
              id: "rule-1",
              name: "Production",
              targetObject: "event",
            },
            {
              id: "rule-2",
              name: "Already attached",
              targetObject: "event",
            },
          ],
          isPending: false,
        }),
      },
    },
    evals: {
      configById: {
        useQuery: () => ({
          data: {
            ruleAssignments: [{ rule: { id: "rule-2" } }],
          },
          isPending: false,
        }),
      },
    },
  },
}));

import { EvaluatorOverviewAttachToRuleButton } from "./EvaluatorOverviewAttachToRuleButton";

describe("EvaluatorOverviewAttachToRuleButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attach.mockResolvedValue(true);
    mocks.attachmentHook.mockReturnValue({
      attach: mocks.attach,
      dismissIssue: vi.fn(),
      pendingKey: null,
      issue: null,
    });
  });

  beforeAll(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("opens the rule picker and attaches the evaluator to the selected rule", () => {
    render(
      <EvaluatorOverviewAttachToRuleButton
        projectId="project-1"
        evaluatorId="evaluator-1"
        evaluatorName="Quality"
        hasWriteAccess
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Attach to rule" }));

    expect(screen.getByPlaceholderText("Find a rule...")).toBeVisible();
    expect(screen.getByText("Create new rule")).toBeVisible();
    expect(screen.queryByText("Already attached")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Production"));
    expect(mocks.attach).toHaveBeenCalledWith({
      evaluatorId: "evaluator-1",
      ruleId: "rule-1",
      evaluatorName: "Quality",
      evaluationRuleName: "Production",
    });
  });
});
