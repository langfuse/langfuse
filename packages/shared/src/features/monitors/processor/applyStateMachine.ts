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
      severityChangedAt: isNotChangingSeverity(params)
        ? prev.severityChangedAt
        : now,
      alertedAt: emit ? now : prev.alertedAt,
    },
  };
}

/** shouldEmit applies the transition-table row matching (prev.severity, next.severity). */
function shouldEmit(params: StateMachineParams): boolean {
  const { prev, next } = params;
  if (isPaused(prev.severity)) return false;
  if (isUnknown(prev.severity)) return isUnhealthy(next.severity);
  if (isRecoveringFromNoData(params))
    return shouldNotifyWhenRecoveringFromNoData(params);
  if (isUnhealthyFromNoData(params)) return true;
  if (isTransitioningToNoData(params))
    return shouldNotifyWhenTransitioningToNoData(params);
  if (isStayingOnNoData(params)) return shouldRenotifyNoData(params);
  if (isNotChangingSeverity(params)) return shouldRenotify(params);
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

/** isRecoveringFromNoData matches NO_DATA -> OK. */
function isRecoveringFromNoData({ prev, next }: StateMachineParams): boolean {
  return prev.severity === "NO_DATA" && next.severity === "OK";
}

/** shouldNotifyWhenRecoveringFromNoData notifies under NOTIFY_NO_DATA, and under SUBSTITUTE_OK right after a mode switch. */
function shouldNotifyWhenRecoveringFromNoData({
  prev,
}: StateMachineParams): boolean {
  return (
    prev.noData.mode === "NOTIFY_NO_DATA" ||
    prev.noData.mode === "SUBSTITUTE_OK"
  );
}

/** isUnhealthyFromNoData matches NO_DATA -> WARNING or ALERT. */
function isUnhealthyFromNoData({ prev, next }: StateMachineParams): boolean {
  return prev.severity === "NO_DATA" && isUnhealthy(next.severity);
}

/** isTransitioningToNoData matches any other severity -> NO_DATA. */
function isTransitioningToNoData({ prev, next }: StateMachineParams): boolean {
  return prev.severity !== "NO_DATA" && next.severity === "NO_DATA";
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

/** shouldNotifyOnNoData reports whether the monitor notifies on NO_DATA at all. */
function shouldNotifyOnNoData(
  params: StateMachineParams,
): params is NotifyNoDataParams {
  return params.prev.noData.mode === "NOTIFY_NO_DATA";
}

/** isStayingOnNoData matches NO_DATA -> NO_DATA. */
function isStayingOnNoData({ prev, next }: StateMachineParams): boolean {
  return prev.severity === "NO_DATA" && next.severity === "NO_DATA";
}

/** shouldRenotifyNoData notifies under NOTIFY_NO_DATA after `intervalMinutes` of sustained NO_DATA, then on the renotify cadence. */
function shouldRenotifyNoData(params: StateMachineParams): boolean {
  if (!shouldNotifyOnNoData(params)) return false;
  if (!hasNotifiedAlready(params)) {
    return isAfterNoDataFirstNotificationInterval(params);
  }
  return shouldRenotify(params);
}

/** isAfterNoDataFirstNotificationInterval reports whether NO_DATA has lasted the monitor's "Notify after … minutes" interval. */
function isAfterNoDataFirstNotificationInterval({
  prev,
  now,
}: NotifyNoDataParams): boolean {
  return hasElapsed({
    since: prev.severityChangedAt,
    minutes: prev.noData.intervalMinutes,
    now,
  });
}

/** shouldRenotify re-notifies a sustained non-OK severity on the renotify cadence after an alert sent during it. */
function shouldRenotify(params: StateMachineParams): boolean {
  if (params.next.severity === "OK") return false;
  if (!hasNotifiedAlready(params)) return false;
  const { alertedAt, renotify } = params.prev;
  if (renotify.mode !== "EVERY") return false;
  return hasElapsed({
    since: alertedAt,
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

/** isNotChangingSeverity matches a transition whose severity stays the same; a PAUSED monitor always stays PAUSED. */
function isNotChangingSeverity({ prev, next }: StateMachineParams): boolean {
  return isPaused(prev.severity) || prev.severity === next.severity;
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
