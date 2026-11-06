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

/** buildAlertMessage builds the human-readable title and markdown body for a MonitorAlert. */
export function buildAlertMessage(args: {
  monitor: Monitor;
  completion: MonitorCompletion;
  value: number | null;
}): { title: string; body: string } {
  const { monitor, completion, value } = args;
  const severity = completion.severity;
  // standard markdown; the Slack builder later runs it through slackify-markdown
  const metricExpr = `${monitor.metric.aggregation}(${monitor.view}.${monitor.metric.measure})`;
  return {
    title: `[${severity}] ${monitor.name}`,
    body: alertBody({ monitor, severity, value, metricExpr }),
  };
}

/** alertBody picks the body shape for the monitor's new severity. */
function alertBody(args: {
  monitor: Monitor;
  severity: MonitorSeverity;
  value: number | null;
  metricExpr: string;
}): string {
  const { monitor, severity, metricExpr } = args;
  if (severity === "NO_DATA") {
    return `\`${metricExpr}\` has no data over the last **${monitor.window}**`;
  }
  if (severity === "OK") return recoveryBody(args);
  return breachBody(args);
}

/** recoveryBody states the evaluated value of a recovered monitor and what it recovered from. */
function recoveryBody(args: {
  monitor: Monitor;
  value: number | null;
  metricExpr: string;
}): string {
  const { monitor } = args;
  const line = valueLine(args);
  if (monitor.severity === "NO_DATA") {
    return `${line}\nThis is reporting data again`;
  }
  const band = recoveryBand(monitor);
  return `${line}\nThis is back within the **${band.label}** threshold of \`${withUnit(String(band.threshold), monitor)}\``;
}

/** valueLine states the metric's evaluated value over the monitor's window. */
function valueLine(args: {
  monitor: Monitor;
  value: number | null;
  metricExpr: string;
}): string {
  const { monitor, value, metricExpr } = args;
  const window = `over the last **${monitor.window}**`;
  const metricValue = withUnit(metricValueFormat.format(value ?? 0), monitor);
  if (value !== null) {
    return `\`${metricExpr} = ${metricValue}\` ${window}`;
  }
  if (substitutesZero(monitor)) {
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

/** substitutesZero reports whether the monitor evaluates missing data as 0. */
function substitutesZero(monitor: Monitor): boolean {
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

/** breachBody states the evaluated value of a WARNING or ALERT monitor and the threshold it crossed. */
function breachBody(args: {
  monitor: Monitor;
  severity: MonitorSeverity;
  value: number | null;
  metricExpr: string;
}): string {
  const { monitor, severity, value } = args;
  const threshold = selectThreshold(
    severity,
    monitor.alertThreshold,
    monitor.warningThreshold ?? null,
  );
  const comparison = `**${operatorWord(monitor.thresholdOperator)}** the **${severity}** threshold of \`${withUnit(String(threshold), monitor)}\``;
  const line = valueLine(args);
  if (value === null && !substitutesZero(monitor)) {
    // LAST_SEVERITY carries a breaching severity through a window without data
    return `${line}\nThe last severity is kept: ${comparison}`;
  }
  return `${line}\nThis is ${comparison}`;
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
