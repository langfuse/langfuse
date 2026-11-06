import { metricUnit } from "../metricUnit";
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

/** unitSuffixes maps declared units to the suffix the alert body shows after a number. */
const unitSuffixes: Record<string, string> = { millisecond: "ms" };

/** renderAlertMessage builds the human-readable title/body for a MonitorAlert. The body distinguishes no-data alerts from threshold-crossing alerts; a threshold-crossing body states the evaluated metric value. */
export function renderAlertMessage(args: {
  monitor: Monitor;
  completion: MonitorCompletion;
  value: number | null;
}): { title: string; body: string } {
  const { monitor, completion, value } = args;
  const prevSeverity = monitor.severity;
  const severity = completion.severity;
  const title = `[${severity}] ${monitor.name}`;
  // standard markdown; the Slack builder later runs it through slackify-markdown
  const metricExpr = `${monitor.metric.aggregation}(${monitor.view}.${monitor.metric.measure})`;
  const metricRef = `\`${metricExpr}\``;
  let body: string;
  if (severity === "NO_DATA") {
    body = `${metricRef} has no data over the last **${monitor.window}**`;
  } else if (prevSeverity === "NO_DATA" && severity === "OK") {
    body = `${metricRef} recovered and is reporting data again`;
  } else if (severity === "OK") {
    body = `${metricRef} recovered`;
  } else {
    body = breachBody({ monitor, severity, value, metricExpr });
  }
  return { title, body };
}

/** breachBody states the evaluated value of a WARNING or ALERT monitor and the threshold it crossed. */
function breachBody(args: {
  monitor: Monitor;
  severity: MonitorSeverity;
  value: number | null;
  metricExpr: string;
}): string {
  const { monitor, severity, value, metricExpr } = args;
  const unit = displayUnit(monitor);
  const threshold = selectThreshold(
    severity,
    monitor.alertThreshold,
    monitor.warningThreshold ?? null,
  );
  const window = `over the last **${monitor.window}**`;
  const comparison = `**${operatorWord(monitor.thresholdOperator)}** the **${severity}** threshold of \`${withUnit(threshold, unit)}\``;
  if (value !== null) {
    return `\`${metricExpr} = ${withUnit(value, unit)}\` ${window}\nThis is ${comparison}`;
  }
  if (monitor.noData.mode === MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO) {
    return `\`${metricExpr} = ${withUnit(0, unit)}\` ${window} (no data, treated as 0)\nThis is ${comparison}`;
  }
  // LAST_SEVERITY carries a breaching severity through a window without data
  return `\`${metricExpr}\` has no data ${window}\nThe last severity is kept: ${comparison}`;
}

/** displayUnit returns the unit printed next to the metric's numbers, or undefined for row counts and unitless metrics. */
function displayUnit(monitor: Monitor): string | undefined {
  if (monitor.metric.aggregation === "count") return undefined;
  return metricUnit(monitor.view, monitor.metric);
}

/** withUnit renders a number with its unit, prefixing USD with "$" and suffixing every other unit. */
function withUnit(value: number, unit: string | undefined): string {
  const formatted = metricValueFormat.format(value);
  if (unit === undefined) return formatted;
  if (unit === "USD") return `$${formatted}`;
  return `${formatted} ${unitSuffixes[unit] ?? unit}`;
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

/** selectThreshold picks the threshold relevant to the current severity (warning band for WARNING, alert for everything else). */
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
