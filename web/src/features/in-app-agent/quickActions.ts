import { getInAppAgentProjectRoute } from "@/src/features/in-app-agent/fns/getInAppAgentProjectRoute";
import { type InAppAgentQuickActionContext } from "@/src/features/in-app-agent/types";

// Coarse section -> tab classifier for the quick-action picker.
// getInAppAgentScreenContextDescription() in context.ts classifies the same
// URL at entity granularity (for the banner and focused action sets).
const QUICK_ACTION_CONTEXT_BY_PROJECT_SECTION: Record<
  string,
  InAppAgentQuickActionContext
> = {
  traces: "observability",
  observations: "observability",
  sessions: "observability",
  users: "observability",
  monitors: "observability",
  dashboards: "dashboards",
  widgets: "dashboards",
  prompts: "prompts",
  playground: "prompts",
  scores: "evaluation",
  evals: "evaluation",
  "annotation-queues": "evaluation",
  datasets: "evaluation",
  experiments: "evaluation",
};

export function getInAppAgentQuickActionContext(
  currentUrl: string,
): InAppAgentQuickActionContext {
  const section = getInAppAgentProjectRoute(currentUrl)?.routeSegments[0];

  return section
    ? (QUICK_ACTION_CONTEXT_BY_PROJECT_SECTION[section] ?? "observability")
    : "observability";
}
