export const CARD_METRICS = [
  "sessions",
  "tools",
  "skills",
  "cost",
  "duration",
  "tokens",
  "invocations",
  "observations",
] as const;
export type AgentCardMetric = (typeof CARD_METRICS)[number];
export type AgentsPrototypeOptions = {
  overviewView: "cards" | "list" | "activity" | "relationships";
  activityView: "timeline" | "heatmap";
  relationshipView:
    | "calls"
    | "tools"
    | "available-tools"
    | "tasks"
    | "areas"
    | "topics";
  profileChart: "contextual" | "pulse" | "none";
  baselineDays: 7 | 14;
  showAttention: boolean;
  showIdentityBadges: boolean;
  cardMetrics: AgentCardMetric[];
};
export const DEFAULT_AGENT_OPTIONS: AgentsPrototypeOptions = {
  overviewView: "cards",
  activityView: "timeline",
  relationshipView: "calls",
  profileChart: "contextual",
  baselineDays: 14,
  showAttention: true,
  showIdentityBadges: false,
  cardMetrics: ["sessions", "tools", "skills", "duration"],
};

function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
): T {
  return choices.find((candidate) => candidate === value) ?? fallback;
}

function baselineDays(value: unknown, fallback: 7 | 14): 7 | 14 {
  if (value === 7 || value === "7") return 7;
  if (value === 14 || value === "14") return 14;
  return fallback;
}
function booleanOption(value: unknown, fallback: boolean): boolean {
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}

export function resolveAgentOptions(
  raw: Record<string, unknown>,
  defaults = DEFAULT_AGENT_OPTIONS,
): AgentsPrototypeOptions {
  const metricInput =
    typeof raw.agentMetrics === "string" ? raw.agentMetrics.split(",") : [];
  const metrics = CARD_METRICS.filter((metric) => metricInput.includes(metric));
  return {
    overviewView: choice(
      raw.agentsView,
      ["cards", "list", "activity", "relationships"],
      defaults.overviewView,
    ),
    activityView: choice(
      raw.agentsActivity,
      ["timeline", "heatmap"],
      defaults.activityView,
    ),
    relationshipView: choice(
      raw.agentsRelation,
      ["calls", "tools", "available-tools", "tasks", "areas", "topics"],
      defaults.relationshipView,
    ),
    profileChart: choice(
      raw.agentChart,
      ["contextual", "pulse", "none"],
      defaults.profileChart,
    ),
    baselineDays: baselineDays(raw.agentBaseline, defaults.baselineDays),
    showAttention: booleanOption(raw.agentAttention, defaults.showAttention),
    showIdentityBadges: booleanOption(
      raw.agentBadges,
      defaults.showIdentityBadges,
    ),
    cardMetrics: metrics.length > 0 ? metrics : defaults.cardMetrics,
  };
}

export function encodeAgentOptions(
  options: AgentsPrototypeOptions,
): Record<string, string> {
  return {
    agentsView: options.overviewView,
    agentsActivity: options.activityView,
    agentsRelation: options.relationshipView,
    agentChart: options.profileChart,
    agentBaseline: String(options.baselineDays),
    agentAttention: options.showAttention ? "1" : "0",
    agentBadges: options.showIdentityBadges ? "1" : "0",
    agentMetrics: options.cardMetrics.join(","),
  };
}
