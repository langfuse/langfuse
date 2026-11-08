import { getMetricUnit } from "../../query/dataModel";
import {
  MonitorNoDataModeSchema,
  type MonitorSeverity,
  type MonitorThresholdOperator,
  type Monitor,
} from "../types";
import type { MonitorCompletion } from "./applyStateMachine";

/** metricValueFormat rounds to 2 decimals or 4 significant digits, whichever keeps more precision. */
const metricValueFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  maximumSignificantDigits: 4,
  roundingPriority: "morePrecision",
  useGrouping: false,
});

/** buildAlertMessage builds the human-readable title and markdown body for a MonitorAlert, shaped by the monitor's new severity. */
export function buildAlertMessage(args: {
  monitor: Monitor;
  completion: MonitorCompletion;
  value: number | null;
}): { title: string; body: string } {
  const { monitor, completion, value } = args;
  const severity = completion.severity;
  const title = `[${severity}] ${monitor.name}`;
  if (severity === "NO_DATA") {
    return { title, body: buildMetricValueMessage({ monitor, value }) };
  }
  if (severity === "OK") {
    return { title, body: buildRecoveryMessage({ monitor, value }) };
  }
  return { title, body: buildBreachMessage({ monitor, severity, value }) };
}

/** buildRecoveryMessage states the evaluated value of a recovered monitor and what it recovered from. */
function buildRecoveryMessage(args: {
  monitor: Monitor;
  value: number | null;
}): string {
  const { monitor } = args;
  const line = buildMetricValueMessage(args);
  if (monitor.severity === "NO_DATA") {
    return `${line}\nThis is reporting data again`;
  }
  const band = recoveryBand(monitor);
  return `${line}\nThis is back within the **${band.label}** threshold of \`${withUnit(String(band.threshold), monitor)}\``;
}

/** buildBreachMessage states the evaluated value of a WARNING or ALERT monitor and the threshold it crossed. */
function buildBreachMessage(args: {
  monitor: Monitor;
  severity: MonitorSeverity;
  value: number | null;
}): string {
  const { monitor, severity, value } = args;
  const threshold = selectThreshold(
    severity,
    monitor.alertThreshold,
    monitor.warningThreshold ?? null,
  );
  const comparison = `**${operatorWord(monitor.thresholdOperator)}** the **${severity}** threshold of \`${withUnit(String(threshold), monitor)}\``;
  const line = buildMetricValueMessage(args);
  if (value === null && !shouldTreatNoDataAsZero(monitor)) {
    // LAST_SEVERITY carries a breaching severity through a window without data
    return `${line}\nThe last severity is kept: ${comparison}`;
  }
  return `${line}\nThis is ${comparison}`;
}

/** buildMetricValueMessage states the metric's evaluated value over the monitor's window. */
function buildMetricValueMessage(args: {
  monitor: Monitor;
  value: number | null;
}): string {
  const { monitor, value } = args;
  // standard markdown; the Slack builder later runs it through slackify-markdown
  const metricExpr = `${monitor.metric.aggregation}(${monitor.view}.${monitor.metric.measure})`;
  const window = `over the last **${monitor.window}**`;
  const metricValue = withUnit(metricValueFormat.format(value ?? 0), monitor);
  if (value !== null) {
    return `\`${metricExpr} = ${metricValue}\` ${window}`;
  }
  if (shouldTreatNoDataAsZero(monitor)) {
    return `\`${metricExpr} = ${metricValue}\` ${window} (no data, treated as 0)`;
  }
  return `\`${metricExpr}\` has no data ${window}`;
}

/** withUnit attaches the monitor metric's unit to a formatted number, prefixing USD with "$" and suffixing every other unit. */
function withUnit(formatted: string, monitor: Monitor): string {
  const unit = getMetricUnit(monitor.view, monitor.metric);
  if (unit === undefined) return formatted;
  if (unit === "USD") return `$${formatted}`;
  return `${formatted} ${unit}`;
}

/** shouldTreatNoDataAsZero reports whether the monitor evaluates a window without data as 0. */
function shouldTreatNoDataAsZero(monitor: Monitor): boolean {
  return monitor.noData.mode === MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO;
}

/** recoveryBand returns the innermost threshold a recovered metric is back within. */
function recoveryBand(monitor: Monitor): { label: string; threshold: number } {
  const warningThreshold = monitor.warningThreshold ?? null;
  if (warningThreshold !== null) {
    return { label: "WARNING", threshold: warningThreshold };
  }
  return { label: "ALERT", threshold: monitor.alertThreshold };
}

/** selectThreshold picks the threshold for the current severity: the warning band for WARNING, the alert threshold otherwise. */
function selectThreshold(
  severity: MonitorSeverity,
  alertThreshold: number,
  warningThreshold: number | null,
): number {
  if (severity === "WARNING" && warningThreshold !== null) {
    return warningThreshold;
  }
  return alertThreshold;
}

/** operatorWord returns the human-readable form of a threshold operator. */
function operatorWord(op: MonitorThresholdOperator): string {
  switch (op) {
    case "GT":
      return "above";
    case "GTE":
      return "at or above";
    case "LT":
      return "below";
    case "LTE":
      return "at or below";
    case "EQ":
      return "equal to";
    case "NEQ":
      return "not equal to";
  }
}
