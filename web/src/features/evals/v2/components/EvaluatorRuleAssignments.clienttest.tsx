import { fireEvent, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  detachMutate: vi.fn(),
  attach: vi.fn(),
  attachAnyway: vi.fn(),
  dismissIssue: vi.fn(),
  attachmentHook: vi.fn(),
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: vi.fn(),
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
    useUtils: () => ({
      evals: { configById: { invalidate: vi.fn() } },
      evalsV2: { invalidate: vi.fn() },
    }),
    evalsV2: {
      rules: {
        useQuery: () => ({
          data: [
            {
              id: "rule-1",
              name: "Attached rule",
              targetObject: "event",
              filter: [],
              sampling: 1,
            },
            {
              id: "rule-2",
              name: "Available rule",
              targetObject: "event",
              filter: [],
              sampling: 0.5,
            },
          ],
          isPending: false,
        }),
      },
      detachEvaluatorFromRule: {
        useMutation: () => ({
          mutate: mocks.detachMutate,
          isPending: false,
        }),
      },
    },
  },
}));

import { EvaluatorRuleAssignments } from "./EvaluatorRuleAssignments";

describe("EvaluatorRuleAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attach.mockResolvedValue(true);
    mocks.attachAnyway.mockResolvedValue(true);
    mocks.attachmentHook.mockReturnValue({
      attach: mocks.attach,
      attachAnyway: mocks.attachAnyway,
      dismissIssue: mocks.dismissIssue,
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

  it("attaches a selected rule through the shared validation flow", () => {
    const onView = vi.fn();
    render(
      <EvaluatorRuleAssignments
        projectId="project-1"
        evaluatorId="evaluator-1"
        evaluatorName="Quality"
        rules={[
          {
            id: "rule-1",
            name: "Attached rule",
            filter: [],
            enabled: true,
          },
          {
            id: "rule-disabled",
            name: "Disabled rule",
            filter: [],
            enabled: false,
          },
        ]}
        hasWriteAccess
        onView={onView}
      />,
      { wrapper: TooltipProvider },
    );

    expect(
      screen.getByRole("link", {
        name: "View execution traces for Attached rule",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Attached rules" }),
    ).toBeInTheDocument();
    const ruleRows = screen.getAllByRole("listitem");
    expect(within(ruleRows[0]).getByText("Active")).toBeInTheDocument();
    expect(within(ruleRows[1]).getByText("Inactive")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Attached rule" }));
    expect(onView).toHaveBeenCalledWith("rule-1");

    fireEvent.click(screen.getByRole("combobox", { name: "Attach to rule" }));
    expect(
      screen.queryByRole("heading", { name: "Attach evaluator to rule" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Create new rule")).toBeInTheDocument();
    expect(screen.queryByText("Evaluator attached to")).not.toBeInTheDocument();
    expect(screen.getByText("Available rules")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Available rule"));
    expect(
      screen.queryByRole("heading", { name: "Attach evaluator to rule?" }),
    ).not.toBeInTheDocument();
    expect(mocks.attach).toHaveBeenCalledWith({
      evaluatorId: "evaluator-1",
      ruleId: "rule-2",
      evaluatorName: "Quality",
      evaluationRuleName: "Available rule",
    });
    fireEvent.keyDown(
      screen.getByRole("button", { name: "More actions for Attached rule" }),
      { key: "Enter" },
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Open rule" }));
    expect(onView).toHaveBeenCalledTimes(2);
  });

  it("lets users review, override, or dismiss a failed validation", () => {
    const onReviewEvaluator = vi.fn();
    mocks.attachmentHook.mockReturnValue({
      attach: mocks.attach,
      attachAnyway: mocks.attachAnyway,
      dismissIssue: mocks.dismissIssue,
      pendingKey: null,
      issue: {
        evaluatorId: "evaluator-1",
        ruleId: "rule-2",
        evaluatorName: "Quality",
        evaluationRuleName: "Available rule",
        outcome: "failed",
        message: "The mapping did not match the sample.",
      },
    });

    render(
      <EvaluatorRuleAssignments
        projectId="project-1"
        evaluatorId="evaluator-1"
        evaluatorName="Quality"
        rules={[]}
        hasWriteAccess
        onView={vi.fn()}
        onReviewEvaluator={onReviewEvaluator}
      />,
      { wrapper: TooltipProvider },
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The mapping did not match the sample.",
    );
    expect(
      screen.getByRole("link", { name: "Review and test evaluator" }),
    ).toHaveAttribute(
      "href",
      "/project/project-1/evals/v2/evaluator-1?edit=1&ruleId=rule-2",
    );
    const reviewLink = screen.getByRole("link", {
      name: "Review and test evaluator",
    });
    reviewLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(reviewLink);
    expect(onReviewEvaluator).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Attach anyway" }));
    expect(mocks.attachAnyway).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss validation warning" }),
    );
    expect(mocks.dismissIssue).toHaveBeenCalledOnce();
  });

  it("blocks the screen while validation is running", () => {
    mocks.attachmentHook.mockReturnValue({
      attach: mocks.attach,
      attachAnyway: mocks.attachAnyway,
      dismissIssue: mocks.dismissIssue,
      pendingKey: "evaluator-1:rule-2",
      issue: null,
    });

    render(
      <EvaluatorRuleAssignments
        projectId="project-1"
        evaluatorId="evaluator-1"
        evaluatorName="Quality"
        rules={[]}
        hasWriteAccess
        onView={vi.fn()}
      />,
      { wrapper: TooltipProvider },
    );

    expect(
      screen.getByRole("dialog", { name: "Checking evaluator" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});
