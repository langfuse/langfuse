import { type DataPoint } from "./chart-props";
import {
  NumberColorThresholdsSchema,
  type NumberColorThresholds,
} from "@langfuse/shared";

type NumberStatus = {
  color: "green" | "amber" | "red";
  label: "Healthy" | "Warning" | "Critical";
};

export type BigNumberPresentation = {
  value: number;
  status: NumberStatus | null;
};

/** Resolves the numeric total and its status before the tile renders. */
export function prepareBigNumber(
  data: DataPoint[],
  thresholds?: NumberColorThresholds,
): BigNumberPresentation | null {
  let value: number | null = null;
  for (const point of data) {
    if (point.metric === null) continue;
    if (typeof point.metric !== "number" || !Number.isFinite(point.metric))
      return null;
    value = (value ?? 0) + point.metric;
  }
  if (value === null || !Number.isFinite(value)) return null;

  const parsed = NumberColorThresholdsSchema.safeParse(thresholds);
  if (!parsed.success) return { value, status: null };

  const { direction, critical, warning } = parsed.data;
  const exceeds = (threshold: number) =>
    direction === "higher-is-better" ? value < threshold : value > threshold;
  let status: NumberStatus = { color: "green", label: "Healthy" };
  if (exceeds(critical)) status = { color: "red", label: "Critical" };
  else if (exceeds(warning)) status = { color: "amber", label: "Warning" };

  return { value, status };
}
