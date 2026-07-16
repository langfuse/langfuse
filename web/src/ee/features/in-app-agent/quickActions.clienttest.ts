import {
  getInAppAgentFocusedQuickActions,
  getInAppAgentQuickActionArea,
  getInAppAgentQuickActionContext,
  getInAppAgentQuickActions,
  isInAppAgentQuickActionId,
} from "./quickActions";

describe("contextual assistant quick actions", () => {
  it("maps product routes to page families and falls back to observability", () => {
    const routes = [
      ["/project/project-1/traces", "tracing"],
      ["/project/project-1/sessions/session-1", "tracing"],
      ["/project/project-1/users/user-1", "tracing"],
      ["/project/project-1/monitors", "tracing"],
      ["/project/project-1/dashboards/dashboard-1", "dashboards"],
      ["/project/project-1/widgets/widget-1", "dashboards"],
      ["/project/project-1/prompts/checkout", "prompts"],
      ["/project/project-1/playground", "prompts"],
      ["/project/project-1/scores/analytics", "evaluators"],
      ["/project/project-1/evals/evaluator-1", "evaluators"],
      ["/project/project-1/annotation-queues/queue-1", "evaluators"],
      ["/project/project-1/datasets/dataset-1", "datasets"],
      ["/project/project-1/experiments/experiment-1", "datasets"],
      ["/project/project-1/settings", "tracing"],
    ] as const;

    for (const [url, expectedContext] of routes) {
      expect(getInAppAgentQuickActionContext(url)).toBe(expectedContext);
    }

    const observabilityActions = getInAppAgentQuickActions("tracing");
    expect(
      getInAppAgentQuickActions(
        getInAppAgentQuickActionContext(
          "/project/project-1/unsupported-feature",
        ),
      ),
    ).toBe(observabilityActions);

    expect(getInAppAgentQuickActionArea("evaluators")).toBe("evaluation");
    expect(getInAppAgentQuickActionArea("datasets")).toBe("evaluation");
    expect(getInAppAgentQuickActions("datasets")).not.toEqual(
      getInAppAgentQuickActions("evaluators"),
    );
  });

  it("returns focused action sets for detail views and undefined for list views", () => {
    expect(
      getInAppAgentFocusedQuickActions("trace")?.map((action) => action.id),
    ).toEqual([
      "analyze-this-trace",
      "summarize-this-trace",
      "break-down-this-trace-cost",
    ]);
    expect(
      getInAppAgentFocusedQuickActions("observation")?.map(
        (action) => action.id,
      ),
    ).toEqual([
      "analyze-this-observation",
      "explain-this-generation",
      "optimize-this-generation-cost",
    ]);
    expect(
      getInAppAgentFocusedQuickActions("prompt")?.map((action) => action.id),
    ).toEqual([
      "review-prompt-best-practices",
      "compare-prompt-versions",
      "check-prompt-performance",
    ]);
    expect(getInAppAgentFocusedQuickActions("trace-list")).toBeUndefined();
    expect(getInAppAgentFocusedQuickActions("page")).toBeUndefined();
    expect(getInAppAgentFocusedQuickActions("datasetItem")).toBeUndefined();
  });

  it("keeps the coarse prompts set non-prompt-focused and distinct from the focused prompt set", () => {
    const coarsePromptActionIds = getInAppAgentQuickActions("prompts").map(
      (action) => action.id,
    );
    const focusedPromptActionIds = getInAppAgentFocusedQuickActions(
      "prompt",
    )?.map((action) => action.id);

    expect(coarsePromptActionIds).toEqual([
      "create-prompt",
      "find-prompts-to-improve",
      "review-prompt-usage",
    ]);
    expect(focusedPromptActionIds).toEqual([
      "review-prompt-best-practices",
      "compare-prompt-versions",
      "check-prompt-performance",
    ]);
    expect(
      coarsePromptActionIds.some((id) => focusedPromptActionIds?.includes(id)),
    ).toBe(false);
  });

  it("accepts focused action ids for attribution validation", () => {
    expect(isInAppAgentQuickActionId("analyze-this-trace", "tracing")).toBe(
      true,
    );
    expect(
      isInAppAgentQuickActionId("review-prompt-best-practices", "prompts"),
    ).toBe(true);
    expect(
      isInAppAgentQuickActionId(
        "set-up-experiment-on-this-dataset",
        "datasets",
      ),
    ).toBe(true);
    expect(isInAppAgentQuickActionId("analyze-this-trace", "prompts")).toBe(
      false,
    );
    expect(isInAppAgentQuickActionId("unknown-action", "tracing")).toBe(false);
  });
});
