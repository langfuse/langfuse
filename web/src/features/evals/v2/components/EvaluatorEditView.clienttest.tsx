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
      evaluatorCount: 2,
    },
    {
      id: "secondary-rule",
      name: "Secondary rule",
      targetObject: "event",
      filter: [{ column: "environment", value: ["staging"] }],
      sampling: 0.25,
      evaluatorCount: 2,
    },
  ],
}));

vi.mock("@/src/features/evals/v2/components/EvaluatorSetupForm", () => ({
  EvaluatorSetupForm: (props: Record<string, unknown>) => {
    mocks.setupProps(props);
    const ruleTabs = (props.ruleTabs ?? []) as Array<{
      id: string;
      name: string;
      filter: Array<Record<string, unknown>>;
      sampling: number;
    }>;
    const activeRule = ruleTabs.find(
      (rule) => rule.id === props.activeRuleTabId,
    );
    return (
      <div>
        Evaluator setup
        <button
          onClick={() => {
            (
              props.onRuleDraftChange as
                | ((draft: {
                    filter: Array<Record<string, unknown>>;
                    sampling: number;
                  }) => void)
                | undefined
            )?.({
              filter: [
                {
                  column: "environment",
                  type: "stringOptions",
                  operator: "any of",
                  value: ["development"],
                },
              ],
              sampling: 0.5,
            });
          }}
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
              estimatedCostUsd: 0.002,
            })
              .then(mocks.beforeSaveResult)
              .catch(() => undefined);
          }}
        >
          Save evaluator
        </button>
        <button
          onClick={() => {
            const onBeforeSave = props.onBeforeSave as
              | ((controls: Record<string, unknown>) => Promise<boolean>)
              | undefined;
            onBeforeSave?.({
              filterState: activeRule?.filter ?? [],
              setFilterState: vi.fn(),
              sampling: activeRule?.sampling ?? 1,
              setSampling: vi.fn(),
              applyRule: mocks.applyRule,
              estimatedCostUsd: 0.002,
            })
              .then(mocks.beforeSaveResult)
              .catch(() => undefined);
          }}
        >
          Save current rules
        </button>
        {ruleTabs.map((rule) => (
          <div key={rule.id}>
            <button
              onClick={() => {
                const selected = (
                  props.onRuleTabChange as
                    | ((
                        ruleId: string,
                        currentDraft: {
                          filter: Array<Record<string, unknown>>;
                          sampling: number;
                        },
                      ) => Record<string, unknown> | undefined)
                    | undefined
                )?.(rule.id, {
                  filter: activeRule?.filter ?? [],
                  sampling: activeRule?.sampling ?? 1,
                });
                if (selected) mocks.applyRule(selected);
              }}
            >
              {rule.name}
            </button>
            {ruleTabs.length > 1 ? (
              <button
                aria-label={`Remove rule ${rule.name}`}
                onClick={() => {
                  const selected = (
                    props.onRemoveRule as
                      | ((
                          ruleId: string,
                          currentDraft: {
                            filter: Array<Record<string, unknown>>;
                            sampling: number;
                          },
                        ) => Record<string, unknown> | undefined)
                      | undefined
                  )?.(rule.id, {
                    filter: activeRule?.filter ?? [],
                    sampling: activeRule?.sampling ?? 1,
                  });
                  if (selected) mocks.applyRule(selected);
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
        <button
          onClick={() => {
            const added = (
              props.onAddRule as
                | ((currentDraft: {
                    filter: Array<Record<string, unknown>>;
                    sampling: number;
                  }) => Record<string, unknown>)
                | undefined
            )?.({
              filter: activeRule?.filter ?? [],
              sampling: activeRule?.sampling ?? 1,
            });
            if (added) mocks.applyRule(added);
          }}
        >
          Add another rule
        </button>
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
      rulePreviews?: unknown[];
    }) => {
      mocks.activationDialogProps(props);
      return props.open ? (
        <div
          role="dialog"
          aria-label={
            props.rulePreviews
              ? "Save rule changes?"
              : "Save and start running?"
          }
        >
          <button onClick={() => props.onSave(false)}>
            {props.rulePreviews ? "Save evaluator only" : "Save only"}
          </button>
          <button onClick={() => props.onSave(true)}>
            {props.rulePreviews
              ? "Save evaluator & attached rules"
              : "Save & run"}
          </button>
        </div>
      ) : null;
    },
  }),
);

vi.mock("@/src/features/evals/v2/components/ActivationCostEstimate", () => ({
  ActivationCostEstimate: () => <div>Estimated usage &amp; cost</div>,
}));

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
    mocks.detachEvaluatorFromRule.mockResolvedValue({
      evaluatorId: "evaluator-1",
    });
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
        evaluatorCount: 2,
      },
      {
        id: "secondary-rule",
        name: "Secondary rule",
        targetObject: "event",
        filter: [{ column: "environment", value: ["staging"] }],
        sampling: 0.25,
        evaluatorCount: 2,
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
        hasRuleChanges: false,
        ruleTabs: [
          expect.objectContaining({
            id: "attached-rule",
            name: "Production rule",
          }),
        ],
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

    fireEvent.click(screen.getByRole("button", { name: "Secondary rule" }));

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
        initialFilterState: expect.any(Array),
        hasRuleChanges: true,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save evaluator" }));

    expect(
      await screen.findByRole("dialog", { name: "Save rule changes?" }),
    ).toBeVisible();
    expect(mocks.activationDialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        setupSampling: 0.5,
        testRunCostUsd: 0.002,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save evaluator only" }),
    );

    expect(mocks.createRule).not.toHaveBeenCalled();
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
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Save evaluator & attached rules",
      }),
    );

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

  it("adds a blank rule inline and exposes it as another tab", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Add another rule" }));

    expect(mocks.setupProps.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        activeRuleTabId: "new-rule-1",
        ruleTabs: [
          expect.objectContaining({
            id: "attached-rule",
            name: "Production rule",
          }),
          expect.objectContaining({ id: "new-rule-1", name: "New rule" }),
        ],
      }),
    );
    expect(mocks.applyRule).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.any(Array),
        sampling: 1,
      }),
    );
  });

  it("shows every current rule in the save modal when one rule changed", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Add another rule" }));
    fireEvent.click(screen.getByRole("button", { name: "Save current rules" }));

    expect(
      await screen.findByRole("dialog", { name: "Save rule changes?" }),
    ).toBeVisible();
    expect(mocks.activationDialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rulePreviews: [
          expect.objectContaining({
            id: "attached-rule",
            name: "Production rule",
          }),
          expect.objectContaining({ id: "new-rule-1", name: "New rule" }),
        ],
      }),
    );

    act(() => {
      const props = mocks.activationDialogProps.mock.lastCall?.[0] as {
        onRuleSamplingChange: (ruleId: string, sampling: number) => void;
      };
      props.onRuleSamplingChange("attached-rule", 0.25);
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save evaluator & attached rules",
      }),
    );

    await waitFor(() =>
      expect(mocks.updateRule).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleId: "attached-rule",
          sampling: 0.25,
        }),
      ),
    );
    expect(mocks.createRule).toHaveBeenCalledOnce();
  });

  it("discards an unsaved rule tab without calling the API", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Add another rule" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove rule New rule" }),
    );

    expect(mocks.setupProps.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        activeRuleTabId: "attached-rule",
        ruleTabs: [
          expect.objectContaining({
            id: "attached-rule",
            name: "Production rule",
          }),
        ],
      }),
    );
    expect(mocks.detachEvaluatorFromRule).not.toHaveBeenCalled();
  });

  it("keeps only the new tab when the last existing rule is removed", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Add another rule" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove rule Production rule" }),
    );

    expect(mocks.setupProps.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        activeRuleTabId: "new-rule-1",
        ruleTabs: [
          expect.objectContaining({ id: "new-rule-1", name: "New rule" }),
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add another rule" }));
    expect(mocks.setupProps.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        activeRuleTabId: "new-rule-2",
        ruleTabs: [
          expect.objectContaining({ id: "new-rule-1" }),
          expect.objectContaining({ id: "new-rule-2" }),
        ],
      }),
    );
  });

  it("detaches a removed existing rule when the evaluator is saved", async () => {
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

    fireEvent.click(
      screen.getByRole("button", { name: "Remove rule Secondary rule" }),
    );

    expect(mocks.setupProps.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        activeRuleTabId: "attached-rule",
        hasRuleChanges: true,
        ruleTabs: [
          expect.objectContaining({
            id: "attached-rule",
            name: "Production rule",
          }),
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save current rules" }));
    expect(
      await screen.findByRole("dialog", { name: "Save rule changes?" }),
    ).toBeVisible();
    expect(mocks.activationDialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rulePreviews: [
          expect.objectContaining({
            id: "attached-rule",
            name: "Production rule",
          }),
        ],
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save evaluator & attached rules",
      }),
    );

    await waitFor(() =>
      expect(mocks.detachEvaluatorFromRule).toHaveBeenCalledWith({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        ruleId: "secondary-rule",
      }),
    );
    expect(mocks.updateRule).not.toHaveBeenCalled();
    expect(mocks.createRule).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.beforeSaveResult).toHaveBeenCalledWith(true),
    );
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
      await screen.findByRole("dialog", { name: "Save rule changes?" }),
    ).toBeVisible();
    expect(mocks.activationDialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        evaluatorId: "evaluator-1",
        sharedRuleCount: 1,
        rulePreviews: [
          expect.objectContaining({
            id: "attached-rule",
            name: "Production rule",
          }),
        ],
      }),
    );
    act(() => {
      const props = mocks.activationDialogProps.mock.lastCall?.[0] as {
        onRuleSamplingChange: (ruleId: string, sampling: number) => void;
      };
      props.onRuleSamplingChange("attached-rule", 0.25);
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save evaluator & attached rules",
      }),
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
        sampling: 0.25,
      }),
    );
    await waitFor(() =>
      expect(mocks.beforeSaveResult).toHaveBeenCalledWith(true),
    );
  });

  it("keeps the shared rule untouched when saving evaluator changes only", async () => {
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
      await screen.findByRole("button", { name: "Save evaluator only" }),
    );

    expect(mocks.updateRule).not.toHaveBeenCalled();
    expect(mocks.createRule).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.beforeSaveResult).toHaveBeenCalledWith(true),
    );
  });

  it("updates the rule directly through the activation flow when it isn't shared", async () => {
    mocks.rules = [
      {
        id: "attached-rule",
        name: "Production rule",
        targetObject: "event",
        filter: [{ column: "environment", value: ["production"] }],
        sampling: 0.5,
        evaluatorCount: 1,
      },
    ];

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

    expect(
      await screen.findByRole("dialog", { name: "Save rule changes?" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save evaluator & attached rules",
      }),
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
    expect(mocks.createRule).not.toHaveBeenCalled();
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
