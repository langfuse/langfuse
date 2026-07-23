import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  setupProps: vi.fn(),
  createRuleDialogProps: vi.fn(),
  applyRule: vi.fn(),
  rules: [
    {
      id: "attached-rule",
      name: "Production rule",
      targetObject: "event",
      filter: [{ column: "environment", value: ["production"] }],
      sampling: 0.5,
    },
    {
      id: "secondary-rule",
      name: "Secondary rule",
      targetObject: "event",
      filter: [{ column: "environment", value: ["staging"] }],
      sampling: 0.25,
    },
  ],
}));

vi.mock("@/src/features/evals/v2/components/EvaluatorSetupForm", () => ({
  EvaluatorSetupForm: (props: Record<string, unknown>) => {
    mocks.setupProps(props);
    const renderDataSourceControls = props.renderDataSourceControls as
      | ((controls: Record<string, unknown>) => React.ReactNode)
      | undefined;
    return (
      <div>
        Evaluator setup
        {renderDataSourceControls?.({
          filterState: [],
          setFilterState: vi.fn(),
          sampling: 1,
          setSampling: vi.fn(),
          applyRule: mocks.applyRule,
        })}
      </div>
    );
  },
}));

vi.mock(
  "@/src/features/evals/v2/components/CreateEvaluationRuleDialog",
  () => ({
    CreateEvaluationRuleDialog: (props: {
      open: boolean;
      initialEvaluatorIds?: string[];
    }) => {
      mocks.createRuleDialogProps(props);
      return props.open ? (
        <div
          role="dialog"
          data-initial-evaluators={props.initialEvaluatorIds?.join(",")}
        >
          New rule dialog
        </div>
      ) : null;
    },
  }),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    evalsV2: {
      rules: {
        useQuery: () => ({
          isPending: false,
          data: mocks.rules,
        }),
      },
    },
  },
}));

import { EvaluatorEditView } from "./EvaluatorEditView";

describe("EvaluatorEditView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rules = [
      {
        id: "attached-rule",
        name: "Production rule",
        targetObject: "event",
        filter: [{ column: "environment", value: ["production"] }],
        sampling: 0.5,
      },
      {
        id: "secondary-rule",
        name: "Secondary rule",
        targetObject: "event",
        filter: [{ column: "environment", value: ["staging"] }],
        sampling: 0.25,
      },
    ];
  });

  it("passes attached rules to filter suggestions without rendering relationship controls", () => {
    render(
      <EvaluatorEditView
        projectId="project-1"
        evaluatorId="evaluator-1"
        sourceTemplate={{ type: "LLM_AS_JUDGE" } as never}
        initialMapping={[]}
        scoreName="Quality"
        description=""
        attachedRuleIds={["attached-rule"]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Evaluator setup")).toBeInTheDocument();
    expect(mocks.setupProps).toHaveBeenCalledWith(
      expect.objectContaining({
        attachedRuleIds: ["attached-rule"],
        scoreName: "Quality",
        description: "",
        initialFilterState: [{ column: "environment", value: ["production"] }],
        initialSampling: 0.5,
        filterEditingDisabled: true,
        samplingEditingDisabled: true,
      }),
    );
    expect(mocks.setupProps.mock.lastCall?.[0]).not.toHaveProperty(
      "renderRuleControls",
    );
    expect(mocks.setupProps.mock.lastCall?.[0]).not.toHaveProperty(
      "renderFilterActions",
    );

    act(() => {
      const props = mocks.setupProps.mock.lastCall?.[0] as {
        onScoreNameChange: (value: string) => void;
        onDescriptionChange: (value: string) => void;
      };
      props.onScoreNameChange("Helpfulness");
      props.onDescriptionChange("Measures response helpfulness");
    });

    expect(mocks.setupProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scoreName: "Helpfulness",
        description: "Measures response helpfulness",
      }),
    );
  });

  it("selects an attached rule for the read-only observation preview", () => {
    render(
      <EvaluatorEditView
        projectId="project-1"
        evaluatorId="evaluator-1"
        sourceTemplate={{ type: "LLM_AS_JUDGE" } as never}
        initialMapping={[]}
        scoreName="Quality"
        description=""
        attachedRuleIds={["attached-rule", "secondary-rule"]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Evaluation rule" }));
    fireEvent.click(screen.getByRole("option", { name: "Secondary rule" }));

    expect(mocks.applyRule).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: [{ column: "environment", value: ["staging"] }],
        sampling: 0.25,
      }),
    );
  });

  it("offers rule creation when no rule is attached", () => {
    render(
      <EvaluatorEditView
        projectId="project-1"
        evaluatorId="evaluator-1"
        sourceTemplate={{ type: "LLM_AS_JUDGE" } as never}
        initialMapping={[]}
        scoreName="Quality"
        description=""
        attachedRuleIds={[]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Evaluator not attached to a rule")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("New rule dialog");
  });

  it("opens rule creation after the attached-rule selector closes", async () => {
    render(
      <EvaluatorEditView
        projectId="project-1"
        evaluatorId="evaluator-1"
        sourceTemplate={{ type: "LLM_AS_JUDGE" } as never}
        initialMapping={[]}
        scoreName="Quality"
        description=""
        attachedRuleIds={["attached-rule"]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("from")).toBeVisible();
    fireEvent.click(screen.getByRole("combobox", { name: "Evaluation rule" }));
    fireEvent.click(screen.getByRole("option", { name: "Create new rule" }));

    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveTextContent("New rule dialog"),
    );
    expect(mocks.createRuleDialogProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initialEvaluatorIds: ["evaluator-1"],
      }),
    );
    expect(mocks.applyRule).not.toHaveBeenCalled();
  });

  it("keeps rule recovery links by prefilling the linked rule", () => {
    render(
      <EvaluatorEditView
        projectId="project-1"
        evaluatorId="evaluator-1"
        sourceTemplate={{ type: "LLM_AS_JUDGE" } as never}
        initialMapping={[]}
        scoreName="Quality"
        description=""
        attachedRuleIds={["attached-rule"]}
        initialEvaluationRuleId="attached-rule"
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(mocks.setupProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialFilterState: [{ column: "environment", value: ["production"] }],
        initialSampling: 0.5,
      }),
    );
  });
});
