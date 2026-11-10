import {
  type MonitorNoData,
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
  if (shouldApplyNoDataRules(params)) return shouldEmitNoData(params);
  if (!isChangingSeverity(params)) return shouldRenotify(params);
  return true;
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

/** shouldApplyNoDataRules matches a transition into, out of, or within NO_DATA. */
function shouldApplyNoDataRules({ prev, next }: StateMachineParams): boolean {
  return isNoData(prev.severity) || isNoData(next.severity);
}

/** isNoData reports whether a severity is NO_DATA. */
function isNoData(severity: MonitorSeverity): boolean {
  return severity === "NO_DATA";
}

/** shouldEmitNoData applies the transition-table rows that involve NO_DATA. */
function shouldEmitNoData(params: StateMachineParams): boolean {
  const { prev, next } = params;
  if (!shouldApplyNoDataRules(params)) return false;
  if (isOk(next.severity)) return shouldNotifyOnNoData(params);
  if (isUnhealthy(next.severity)) return true;
  if (!isNoData(prev.severity))
    return shouldNotifyWhenTransitioningToNoData(params);
  return shouldRenotifyNoData(params);
}

/** isOk reports whether a severity is OK. */
function isOk(severity: MonitorSeverity): boolean {
  return severity === "OK";
}

/** shouldNotifyWhenTransitioningToNoData notifies under NOTIFY_NO_DATA once the cooldown since the last alert has elapsed. */
function shouldNotifyWhenTransitioningToNoData(
  params: StateMachineParams,
): boolean {
  if (!shouldNotifyOnNoData(params)) return false;
  const { prev, now } = params;
  return hasElapsed({
    since: prev.alertedAt,
    minutes: prev.noData.intervalMinutes,
    now,
  });
}

/** shouldNotifyOnNoData reports whether the monitor notifies on entering, staying in, or leaving NO_DATA. */
function shouldNotifyOnNoData(
  params: StateMachineParams,
): params is NotifyNoDataParams {
  // SUBSTITUTE_OK never computes NO_DATA, so only NOTIFY_NO_DATA reaches the interval rules
  return (
    params.prev.noData.mode === "NOTIFY_NO_DATA" ||
    params.prev.noData.mode === "SUBSTITUTE_OK"
  );
}

/** shouldRenotifyNoData handles NO_DATA -> NO_DATA: it notifies under NOTIFY_NO_DATA after `intervalMinutes` of sustained NO_DATA, then on the renotify cadence. */
function shouldRenotifyNoData(params: StateMachineParams): boolean {
  if (!shouldNotifyOnNoData(params)) return false;
  if (!hasNotifiedAlready(params)) {
    return hasElapsed({
      since: params.prev.severityChangedAt,
      minutes: params.prev.noData.intervalMinutes,
      now: params.now,
    });
  }
  return shouldRenotify(params);
}

/** shouldRenotify re-notifies a sustained non-OK severity on the renotify cadence after an alert sent during it. */
function shouldRenotify(params: StateMachineParams): boolean {
  const { renotify } = params.prev;
  if (renotify.mode !== "EVERY") return false;
  if (params.next.severity === "OK") return false;
  if (!hasNotifiedAlready(params)) return false;
  return hasElapsed({
    since: params.prev.alertedAt,
    minutes: renotify.intervalMinutes,
    now: params.now,
  });
}

/** hasNotifiedAlready reports whether the monitor notified during the current severity. */
function hasNotifiedAlready(
  params: StateMachineParams,
): params is NotifiedParams {
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

/** NotifyNoDataParams is a StateMachineParams whose monitor notifies on NO_DATA. */
type NotifyNoDataParams = StateMachineParams & {
  prev: { noData: Extract<MonitorNoData, { mode: "NOTIFY_NO_DATA" }> };
};
