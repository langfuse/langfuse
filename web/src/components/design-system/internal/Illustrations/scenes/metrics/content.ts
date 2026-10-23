import type { ValueFormat } from "../../engine/values";

export type MetricsMarker = {
  /** The point the crosshair rests on. */
  index: number;
  /** The tooltip's first line, shown as written. */
  date: string;
  /** Counts up in the tooltip. */
  value: number;
  /** After the value, as written: "traces", "ms", "USD". */
  unit: string;
  format?: ValueFormat;
};

export type MetricsContent = {
  /** The series, 0–1 from the baseline to the top guide. */
  points: number[];
  /** Where each point sits along the time axis, 0–1; evenly spaced when absent or a different length. */
  positions?: number[];
  /** Axis labels, spaced evenly from the start of the axis. */
  dates: string[];
  marker: MetricsMarker;
};

/** Characters per slot before an ellipsis, and how many points and dates are drawn. */
export const METRICS_LIMITS = {
  points: 24,
  dates: 5,
  date: 10,
  unit: 10,
  value: 8,
} as const;

export const METRICS_DEFAULTS: MetricsContent = {
  points: [
    0.054, 0.179, 0.633, 0.774, 0.634, 0.361, 0.245, 0.294, 0.485, 0.629, 0.735,
    0.836, 0.487, 0.417, 0.536, 0.71, 0.842, 0.817, 0.696, 0.591,
  ],
  positions: [
    0, 0.045, 0.128, 0.177, 0.211, 0.236, 0.277, 0.304, 0.326, 0.36, 0.42,
    0.543, 0.607, 0.653, 0.67, 0.709, 0.759, 0.804, 0.843, 0.89,
  ],
  dates: ["30/8", "3/9", "7/9"],
  marker: { index: 6, date: "2026/2/9", value: 218, unit: "traces" },
};
