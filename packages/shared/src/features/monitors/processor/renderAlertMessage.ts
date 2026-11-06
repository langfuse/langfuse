import {
  MonitorNoDataModeSchema,
  type MonitorSeverity,
  type MonitorThresholdOperator,
  type Monitor,
} from "../types";
import type { MonitorCompletion } from "./applyStateMachine";

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
    const threshold = selectThreshold(
      severity,
      monitor.alertThreshold,
      monitor.warningThreshold ?? null,
    );
    const comparison = `**${operatorWord(monitor.thresholdOperator)}** the **${severity}** threshold of \`${threshold}\``;
    if (value !== null) {
      body = `\`${metricExpr} = ${formatMetricValue(value)}\` over the last **${monitor.window}**\nThis is ${comparison}`;
    } else if (
      monitor.noData.mode === MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO
    ) {
      body = `\`${metricExpr} = 0\` over the last **${monitor.window}** (no data, treated as 0)\nThis is ${comparison}`;
    } else {
      // LAST_SEVERITY carries a breaching severity through a window without data
      body = `${metricRef} has no data over the last **${monitor.window}**\nThe last severity is kept: ${comparison}`;
    }
  }
  return { title, body };
}

/** metricValueFormat rounds to 2 decimals or 4 significant digits, whichever keeps more precision, so both large values and tiny costs stay readable. */
const metricValueFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  maximumSignificantDigits: 4,
  roundingPriority: "morePrecision",
  useGrouping: false,
});

/** formatMetricValue renders an evaluated metric value for the alert body. */
function formatMetricValue(value: number): string {
  return metricValueFormat.format(value);
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
