/**
 * Observation-type bar colors for the timeline renderer.
 * Hue carries TYPE and nothing else (focus/selection are wash + ring).
 */
export const OBSERVATION_TYPE_COLOR: Record<string, string> = {
  TRACE: "bg-dark-green",
  GENERATION: "bg-muted-magenta",
  EVENT: "bg-muted-green",
  SPAN: "bg-muted-blue",
  AGENT: "bg-purple-600",
  TOOL: "bg-orange-600",
  CHAIN: "bg-pink-600",
  RETRIEVER: "bg-teal-600",
  EMBEDDING: "bg-amber-600",
  GUARDRAIL: "bg-red-600",
  // Same hue ItemBadge uses for evaluator items (text-primary-accent).
  EVALUATOR: "bg-primary-accent",
};

export const OBSERVATION_TYPE_FALLBACK_COLOR = "bg-muted-gray";
