import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  setupProps: vi.fn(),
  activationDialogProps: vi.fn(),
  applyRule: vi.fn(),
  beforeSaveResult: vi.fn(),
  updateRule: vi.fn(),
  createRule: vi.fn(),
  detachEvaluatorFromRule: vi.fn(),
  invalidateRules: vi.fn(),
  invalidateEvalsV2: vi.fn(),
  invalidateEvals: vi.fn(),
  invalidateConfig: vi.fn(),
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
        <button
          onClick={() =>
            (
              props.onFiltersEdited as
                | ((filters: Array<Record<string, unknown>>) => void)
                | undefined
            )?.([
              {
                column: "environment",
                type: "stringOptions",
                operator: "any of",
                value: ["development"],
              },
            ])
          }
        >
          Edit filters
        </button>
        <button
          onClick={() => {
            const onBeforeSave = props.onBeforeSave as
              | ((controls: Record<string, unknown>) => Promise<boolean>)
              | undefined;
            onBeforeSave?.({
              filterState: [
                {
                  column: "environment",
                  type: "stringOptions",
                  operator: "any of",
                  value: ["development"],
                },
              ],
              setFilterState: vi.fn(),
              sampling: 0.5,
              setSampling: vi.fn(),
              applyRule: mocks.applyRule,
            })
              .then(mocks.beforeSaveResult)
              .catch(() => undefined);
          }}
        >
          Save evaluator
        </button>
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
  "@/src/features/evals/v2/components/CreateEvaluatorActivationDialog",
  () => ({
    CreateEvaluatorActivationDialog: (props: {
      open: boolean;
      onSave: (runContinuously: boolean) => void;
    }) => {
      mocks.activationDialogProps(props);
      return props.open ? (
        <div role="dialog" aria-label="Save and start running?">
          <button onClick={() => props.onSave(false)}>Save only</button>
          <button onClick={() => props.onSave(true)}>Save &amp; run</button>
        </div>
      ) : null;
    },
  }),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      evalsV2: {
        rules: { invalidate: mocks.invalidateRules },
        invalidate: mocks.invalidateEvalsV2,
      },
      evals: {
        invalidate: mocks.invalidateEvals,
        configById: { invalidate: mocks.invalidateConfig },
      },
    }),
    evalsV2: {
      rules: {
        useQuery: () => ({
          isPending: false,
          data: mocks.rules,
        }),
      },
      updateRule: {
        useMutation: () => ({
          mutateAsync: mocks.updateRule,
          isPending: false,
        }),
      },
      createRule: {
        useMutation: () => ({
          mutateAsync: mocks.createRule,
          isPending: false,
        }),
      },
      detachEvaluatorFromRule: {
        useMutation: () => ({
          mutateAsync: mocks.detachEvaluatorFromRule,
          isPending: false,
        }),
      },
    },
  },
}));

import { EvaluatorEditView } from "./EvaluatorEditView";

describe("EvaluatorEditView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateRule.mockResolvedValue({ id: "attached-rule" });
    mocks.createRule.mockResolvedValue({ id: "new-rule" });
    mocks.detachEvaluatorFromRule.mockResolvedValue({});
    mocks.invalidateRules.mockResolvedValue(undefined);
    mocks.invalidateEvalsV2.mockResolvedValue(undefined);
    mocks.invalidateEvals.mockResolvedValue(undefined);
    mocks.invalidateConfig.mockResolvedValue(undefined);
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
        samplingEditingDisabled: true,
        hasRuleChanges: false,
      }),
    );
    expect(mocks.setupProps.mock.lastCall?.[0]).not.toHaveProperty(
      "filterEditingDisabled",
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

  it("selects an attached rule for the editable observation filters", () => {
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

  it("uses the normal default-filter flow when no rule is attached", async () => {
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

    expect(
      screen.queryByText("Evaluator not attached to a rule"),
    ).not.toBeInTheDocument();
    expect(mocks.setupProps.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        initialFilterState: undefined,
        hasRuleChanges: true,
        samplingEditingDisabled: false,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save evaluator" }));

    expect(
      await screen.findByRole("dialog", { name: "Save and start running?" }),
    ).toBeVisible();
    expect(mocks.activationDialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        setupSampling: 0.5,
        testRunCostUsd: null,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save only" }));

    expect(mocks.createRule).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: "Save filter changes" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.beforeSaveResult).toHaveBeenCalledWith(true),
    );
  });

  it("creates a rule when starting an unattached evaluator", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Save evaluator" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save & run" }));

    await waitFor(() =>
      expect(mocks.createRule).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          targetObject: "event",
          evaluatorIds: ["evaluator-1"],
        }),
      ),
    );
    expect(mocks.beforeSaveResult).toHaveBeenCalledWith(true);
  });

  it("does not offer rule creation in the attached-rule selector", () => {
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

    expect(screen.getByText("using rule")).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Evaluation rule" }),
    ).toHaveClass("flex-1");
    fireEvent.click(screen.getByRole("combobox", { name: "Evaluation rule" }));
    expect(
      screen.queryByRole("option", { name: "Create new rule" }),
    ).not.toBeInTheDocument();
  });

  it("updates the selected rule when saving edited filters", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Edit filters" }));
    expect(mocks.setupProps.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ hasRuleChanges: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save evaluator" }));

    expect(
      await screen.findByRole("dialog", { name: "Save filter changes" }),
    ).toHaveTextContent(
      "Update “Production rule” for every evaluator using it",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Update existing rule" }),
    );

    await waitFor(() =>
      expect(mocks.updateRule).toHaveBeenCalledWith({
        projectId: "project-1",
        ruleId: "attached-rule",
        name: "Production rule",
        filter: [
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: ["development"],
          },
        ],
        sampling: 0.5,
      }),
    );
    await waitFor(() =>
      expect(mocks.beforeSaveResult).toHaveBeenCalledWith(true),
    );
  });

  it("forks the selected rule for only this evaluator", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Edit filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Save evaluator" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Create new rule" }),
    );

    await waitFor(() =>
      expect(mocks.createRule).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          targetObject: "event",
          filter: [
            {
              column: "environment",
              type: "stringOptions",
              operator: "any of",
              value: ["development"],
            },
          ],
          sampling: 0.5,
          enabled: true,
          evaluatorIds: ["evaluator-1"],
        }),
      ),
    );
    expect(mocks.detachEvaluatorFromRule).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      ruleId: "attached-rule",
    });
    await waitFor(() =>
      expect(mocks.beforeSaveResult).toHaveBeenCalledWith(true),
    );
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
