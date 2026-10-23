export type ObservabilitySpan = {
  /** Shown exactly as written (span names are code), cut in the middle when long. */
  name: string;
  /** Seconds. */
  duration: number;
  /** USD. */
  cost: number;
  /** Seconds on the axis where the span's bar begins; defaults to the previous span's start. */
  start?: number;
};

export type ObservabilityContent = {
  /** One row each, top to bottom; the first is the trace's root. Up to five; rows below the frame fade out. */
  spans: ObservabilitySpan[];
  /** Index of the raised span. */
  selected: number;
  /** Tick values in seconds, evenly spaced along the top. */
  axis: number[];
};

/** Characters per slot before an ellipsis, and how many rows and ticks are drawn. */
export const OBSERVABILITY_LIMITS = {
  name: 24,
  duration: 8,
  cost: 10,
  spans: 5,
  ticks: 6,
} as const;

export const OBSERVABILITY_DEFAULTS: ObservabilityContent = {
  spans: [
    {
      name: "handle-chatbot-message",
      duration: 18.22,
      cost: 0.001688,
      start: 0,
    },
    { name: "get-langfuse-prompt", duration: 0.63, cost: 0.00064, start: 0.2 },
    { name: "create-mcp-client", duration: 0.13, cost: 0.000264, start: 0.17 },
    { name: "streamText", duration: 14.68, cost: 0.000132, start: 0.485 },
  ],
  selected: 1,
  axis: [0, 0.5, 1, 1.5, 2],
};
