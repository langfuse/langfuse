import {
  type MonitorNoDataMode,
  type MonitorSeverity,
  type MonitorStatus,
  type Monitor,
} from "../types";

/** applyStateMachine maps a monitor's prior row and newly computed severity to its lifecycle writeback and whether to emit an alert. */
export function applyStateMachine(
  params: StateMachineParams,
): StateMachineDecision {
  const { prev, next, now, publishedAt } = params;
  const emit = shouldEmit(params);

  return {
    emit,
    completion: {
      monitorId: prev.id,
      lastClaimedAt: now,
      lastCompletedAt: now,
      publishedAt,
      status: prev.status,
      severity: isPaused(prev.severity) ? "PAUSED" : next.severity,
      severityChangedAt: isChangingSeverity(params)
        ? now
        : prev.severityChangedAt,
      alertedAt: emit ? now : prev.alertedAt,
    },
  };
}

/** shouldEmit applies the transition-table row matching (prev.severity, next.severity). */
function shouldEmit(params: StateMachineParams): boolean {
  const { prev, next } = params;
  if (isPaused(prev.severity)) return false;
  if (isUnknown(prev.severity)) return isUnhealthy(next.severity);
  if (hasNotifiedAlready(params)) return shouldRenotify(params);
  if (isNoDataTransition(params)) return shouldNotifyOnNoDataTransition(params);
  return isChangingSeverity(params);
}

/** isPaused reports whether the service paused the monitor, which the worker must never undo. */
function isPaused(severity: MonitorSeverity): boolean {
  return severity === "PAUSED";
}

/** isUnknown reports whether the monitor has not been evaluated since it was created or resumed. */
function isUnknown(severity: MonitorSeverity): boolean {
  return severity === "UNKNOWN";
}

/** isUnhealthy reports whether a severity is WARNING or ALERT. */
function isUnhealthy(severity: MonitorSeverity): boolean {
  return severity === "WARNING" || severity === "ALERT";
}

/** isNoDataTransition matches a transition into, out of, or within NO_DATA. */
function isNoDataTransition({ prev, next }: StateMachineParams): boolean {
  return isNoData(prev.severity) || isNoData(next.severity);
}

/** isNoData reports whether a severity is NO_DATA. */
function isNoData(severity: MonitorSeverity): boolean {
  return severity === "NO_DATA";
}

/** shouldNotifyOnNoDataTransition applies the transition-table rows that involve NO_DATA. */
function shouldNotifyOnNoDataTransition(params: StateMachineParams): boolean {
  const { prev, next } = params;
  if (isUnhealthy(next.severity)) return true;
  if (!shouldNoDataModeNotify(prev.noData.mode)) return false;
  if (isOk(next.severity)) return true;
  return hasNoDataIntervalElapsed(params);
}

/** isOk reports whether a severity is OK. */
function isOk(severity: MonitorSeverity): boolean {
  return severity === "OK";
}

/** shouldNoDataModeNotify reports whether a no-data mode notifies on entering, staying in, or leaving NO_DATA. */
function shouldNoDataModeNotify(mode: MonitorNoDataMode): boolean {
  return mode === "NOTIFY_NO_DATA" || mode === "SUBSTITUTE_OK";
}

/** hasNoDataIntervalElapsed reports whether the "Notify after … minutes" interval has passed since the last alert when entering NO_DATA, or since NO_DATA began when staying in it. */
function hasNoDataIntervalElapsed({ prev, now }: StateMachineParams): boolean {
  const { noData } = prev;
  if (noData.mode !== "NOTIFY_NO_DATA") return false;
  return hasElapsed({
    since: isNoData(prev.severity) ? prev.severityChangedAt : prev.alertedAt,
    minutes: noData.intervalMinutes,
    now,
  });
}

/** shouldRenotify re-notifies a sustained non-OK severity on the renotify cadence after an alert sent during it; a sustained NO_DATA only when the monitor notifies on NO_DATA. */
function shouldRenotify(params: StateMachineParams): boolean {
  const { renotify } = params.prev;
  const { next } = params;
  if (renotify.mode !== "EVERY") return false;
  if (isOk(next.severity)) return false;
  if (
    isNoData(next.severity) &&
    !shouldNoDataModeNotify(params.prev.noData.mode)
  )
    return false;
  if (!hasNotifiedAlready(params)) return false;
  return hasElapsed({
    since: params.prev.alertedAt,
    minutes: renotify.intervalMinutes,
    now: params.now,
  });
}

/** hasNotifiedAlready reports whether the monitor notified during a severity that continues into this evaluation. */
function hasNotifiedAlready(
  params: StateMachineParams,
): params is NotifiedParams {
  if (isChangingSeverity(params)) return false;
  const { alertedAt, severityChangedAt } = params.prev;
  if (alertedAt === null) return false;
  return severityChangedAt === null || alertedAt >= severityChangedAt;
}

/** isChangingSeverity matches a transition to a different severity; a PAUSED monitor always stays PAUSED. */
function isChangingSeverity({ prev, next }: StateMachineParams): boolean {
  return !isPaused(prev.severity) && prev.severity !== next.severity;
}

/** hasElapsed reports whether at least `minutes` have passed between `since` and `now`; a null `since` counts as elapsed. */
function hasElapsed({
  since,
  minutes,
  now,
}: {
  since: Date | null;
  minutes: number;
  now: Date;
}): boolean {
  if (since === null) return true;
  return now.getTime() - since.getTime() >= minutes * 60_000;
}

/** MonitorCompletion is one row of the bulk update the state machine emits for a single monitor. */
export type MonitorCompletion = {
  monitorId: string;
  lastClaimedAt: Date;
  lastCompletedAt: Date;
  publishedAt: Date;
  status: MonitorStatus;
  severity: MonitorSeverity;
  severityChangedAt: Date | null;
  alertedAt: Date | null;
};

/** StateMachineDecision is the per-monitor evaluation outcome: the lifecycle writeback and whether to emit an alert. */
export type StateMachineDecision = {
  completion: MonitorCompletion;
  emit: boolean;
};

/** StateMachineParams is a monitor's prior row, its newly computed severity and the evaluation clock. */
type StateMachineParams = {
  prev: Monitor;
  next: Pick<Monitor, "severity">;
  now: Date;
  publishedAt: Date;
};

/** NotifiedParams is a StateMachineParams whose monitor notified during the current severity. */
type NotifiedParams = StateMachineParams & { prev: { alertedAt: Date } };
