/**
 * Observation-type bar colors shared by the timeline and lanes renderers.
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
};

export const OBSERVATION_TYPE_FALLBACK_COLOR = "bg-muted-gray";
