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
  const severity = isPaused(prev.severity) ? "PAUSED" : next.severity;
  const severityChanged = prev.severity !== severity;
  const emit = shouldEmit(params);

  return {
    emit,
    completion: {
      monitorId: prev.id,
      lastClaimedAt: now,
      lastCompletedAt: now,
      publishedAt,
      status: prev.status,
      severity,
      severityChangedAt: severityChanged ? now : prev.severityChangedAt,
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
  if (isNotChangingSeverity(params))
    return shouldRenotifyWhenNotChangingSeverity(params);
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
  return passedDelay(prev.alertedAt, prev.noData.intervalMinutes, now);
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
    const { prev, now } = params;
    return passedDelay(
      prev.severityChangedAt,
      prev.noData.intervalMinutes,
      now,
    );
  }
  return shouldRenotify(params);
}

/** shouldRenotify re-notifies on the renotify cadence after an alert sent during the current severity. */
function shouldRenotify(params: StateMachineParams): boolean {
  if (!hasNotifiedAlready(params)) return false;
  const { alertedAt, renotify } = params.prev;
  if (renotify.mode !== "EVERY") return false;
  return passedDelay(alertedAt, renotify.intervalMinutes, params.now);
}

/** hasNotifiedAlready reports whether the monitor notified during the current severity. */
function hasNotifiedAlready(
  params: StateMachineParams,
): params is NotifiedParams {
  const { alertedAt, severityChangedAt } = params.prev;
  if (alertedAt === null) return false;
  return severityChangedAt === null || alertedAt >= severityChangedAt;
}

/** isNotChangingSeverity matches a transition whose severity stays the same. */
function isNotChangingSeverity({ prev, next }: StateMachineParams): boolean {
  return prev.severity === next.severity;
}

/** shouldRenotifyWhenNotChangingSeverity re-notifies a sustained WARNING or ALERT on the renotify cadence; OK never re-notifies. */
function shouldRenotifyWhenNotChangingSeverity(
  params: StateMachineParams,
): boolean {
  if (params.next.severity === "OK") return false;
  return shouldRenotify(params);
}

/** passedDelay returns true when at least `intervalMinutes` has elapsed since `prevAlertedAt`; NULL fires immediately. */
function passedDelay(
  prevAlertedAt: Date | null,
  intervalMinutes: number,
  now: Date,
): boolean {
  if (prevAlertedAt === null) return true;
  const intervalMs = intervalMinutes * 60_000;
  return now.getTime() - prevAlertedAt.getTime() >= intervalMs;
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
