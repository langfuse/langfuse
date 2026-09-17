import { formatDistanceToNowStrict } from "date-fns";

/** Renders the most recent evaluator alert emission time. */
export function renderEvaluatorAlertLastFired(alertedAt: Date | null): string {
  return alertedAt
    ? `Last fired ${formatDistanceToNowStrict(alertedAt, { addSuffix: true })}`
    : "Never fired";
}
