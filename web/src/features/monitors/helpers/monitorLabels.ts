import {
  type MonitorThresholdOperator,
  type MonitorView,
  type MonitorWindow,
} from "@langfuse/shared/monitors";

/** windowLabels maps each MonitorWindow to a prose label for metric descriptions, e.g. "hour". */
export const windowLabels: Record<MonitorWindow, string> = {
  "5m": "5 minutes",
  "10m": "10 minutes",
  "15m": "15 minutes",
  "30m": "30 minutes",
  "1h": "hour",
  "2h": "2 hours",
  "4h": "4 hours",
  "1d": "1 day",
  "2d": "2 days",
  "1w": "week",
};

/** windowSelectLabels maps each MonitorWindow to its dropdown label, quantifying the singular units, e.g. "1 hour". */
export const windowSelectLabels: Record<MonitorWindow, string> = {
  ...windowLabels,
  "1h": "1 hour",
  "1w": "1 week",
};

/** operatorLabels maps each MonitorThresholdOperator to a natural-language label. */
export const operatorLabels: Record<MonitorThresholdOperator, string> = {
  GT: "above",
  GTE: "above or equal to",
  LT: "below",
  LTE: "below or equal to",
  EQ: "equal to",
  NEQ: "not equal to",
};

/** operatorSymbol maps each MonitorThresholdOperator to a single math glyph. */
export const operatorSymbol: Record<MonitorThresholdOperator, string> = {
  GT: ">",
  GTE: "≥",
  LT: "<",
  LTE: "≤",
  EQ: "=",
  NEQ: "≠",
};

/** viewLabels maps each MonitorView to a human label. */
export const viewLabels: Record<MonitorView, string> = {
  observations: "Observations",
  "scores-numeric": "Scores (numeric)",
  "scores-categorical": "Scores (categorical)",
};
