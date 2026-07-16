import {
  getInAppAgentQuickActionArea,
  getInAppAgentQuickActionContext,
  getInAppAgentQuickActions,
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
});
