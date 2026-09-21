import type {
  MonitorSeverity,
  MonitorThresholdOperator,
  Monitor,
} from "../types";
import type { MonitorCompletion } from "./applyStateMachine";

/** renderAlertMessage builds the human-readable title/body for a MonitorAlert. The body distinguishes no-data alerts from threshold-crossing alerts. */
export function renderAlertMessage(args: {
  monitor: Monitor;
  completion: MonitorCompletion;
}): { title: string; body: string } {
  const { monitor, completion } = args;
  const prevSeverity = monitor.severity;
  const severity = completion.severity;
  const title = `[${severity}] ${monitor.name}`;
  // standard markdown; the Slack builder later runs it through slackify-markdown
  const metricRef = `\`${monitor.metric.aggregation}(${monitor.view}.${monitor.metric.measure})\``;
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
    body = `${metricRef} is **${operatorWord(monitor.thresholdOperator)}** \`${threshold}\` over the last **${monitor.window}**`;
  }
  return { title, body };
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
