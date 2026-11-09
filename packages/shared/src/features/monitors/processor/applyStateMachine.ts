import {
  type MonitorNoData,
  type MonitorRenotify,
  type MonitorSeverity,
  type MonitorStatus,
  type Monitor,
} from "../types";

/** applyStateMachine maps a monitor's prior row and newly computed severity to its lifecycle writeback and whether to emit an alert. */
export function applyStateMachine(args: {
  prev: Monitor;
  next: { severity: MonitorSeverity };
  now: Date;
  publishedAt: Date;
}): StateMachineDecision {
  const { prev, next, now, publishedAt } = args;

  // PAUSED is service-written; no-op so the worker doesn't overwrite user intent.
  if (prev.severity === "PAUSED") {
    return {
      emit: false,
      completion: {
        monitorId: prev.id,
        lastClaimedAt: now,
        lastCompletedAt: now,
        publishedAt,
        status: prev.status,
        severity: "PAUSED",
        severityChangedAt: prev.severityChangedAt,
        alertedAt: prev.alertedAt,
      },
    };
  }

  const severityChanged = prev.severity !== next.severity;

  const emit = shouldEmit({
    prevSeverity: prev.severity,
    nextSeverity: next.severity,
    prevAlertedAt: prev.alertedAt,
    prevSeverityChangedAt: prev.severityChangedAt,
    now,
    noData: prev.noData,
    renotify: prev.renotify,
  });

  return {
    emit,
    completion: {
      monitorId: prev.id,
      lastClaimedAt: now,
      lastCompletedAt: now,
      publishedAt,
      status: prev.status,
      severity: next.severity,
      severityChangedAt: severityChanged ? now : prev.severityChangedAt,
      alertedAt: emit ? now : prev.alertedAt,
    },
  };
}

/** shouldEmit applies the transition-table row matching (prevSeverity, nextSeverity). */
function shouldEmit(transition: SeverityTransition): boolean {
  if (transition.prevSeverity === "UNKNOWN")
    return isUnhealthy(transition.nextSeverity);
  if (isRecoveringFromNoData(transition))
    return shouldNotifyWhenRecoveringFromNoData(transition);
  if (isUnhealthyFromNoData(transition)) return true;
  if (isTransitioningToNoData(transition))
    return shouldNotifyWhenTransitioningToNoData(transition);
  if (isStayingOnNoData(transition)) return shouldRenotifyNoData(transition);
  if (isNotChangingSeverity(transition))
    return shouldRenotifyWhenNotChangingSeverity(transition);
  return true;
}

/** isUnhealthy reports whether a severity is WARNING or ALERT. */
function isUnhealthy(severity: MonitorSeverity): boolean {
  return severity === "WARNING" || severity === "ALERT";
}

/** isRecoveringFromNoData matches NO_DATA -> OK. */
function isRecoveringFromNoData({
  prevSeverity,
  nextSeverity,
}: SeverityTransition): boolean {
  return prevSeverity === "NO_DATA" && nextSeverity === "OK";
}

/** shouldNotifyWhenRecoveringFromNoData notifies under NOTIFY_NO_DATA, and under SUBSTITUTE_OK right after a mode switch. */
function shouldNotifyWhenRecoveringFromNoData({
  noData,
}: SeverityTransition): boolean {
  return noData.mode === "NOTIFY_NO_DATA" || noData.mode === "SUBSTITUTE_OK";
}

/** isUnhealthyFromNoData matches NO_DATA -> WARNING or ALERT. */
function isUnhealthyFromNoData({
  prevSeverity,
  nextSeverity,
}: SeverityTransition): boolean {
  return prevSeverity === "NO_DATA" && isUnhealthy(nextSeverity);
}

/** isTransitioningToNoData matches any other severity -> NO_DATA. */
function isTransitioningToNoData({
  prevSeverity,
  nextSeverity,
}: SeverityTransition): boolean {
  return prevSeverity !== "NO_DATA" && nextSeverity === "NO_DATA";
}

/** shouldNotifyWhenTransitioningToNoData notifies under NOTIFY_NO_DATA once the cooldown since the last alert has elapsed. */
function shouldNotifyWhenTransitioningToNoData({
  noData,
  prevAlertedAt,
  now,
}: SeverityTransition): boolean {
  if (noData.mode !== "NOTIFY_NO_DATA") return false;
  return passedDelay(prevAlertedAt, noData.intervalMinutes, now);
}

/** isStayingOnNoData matches NO_DATA -> NO_DATA. */
function isStayingOnNoData({
  prevSeverity,
  nextSeverity,
}: SeverityTransition): boolean {
  return prevSeverity === "NO_DATA" && nextSeverity === "NO_DATA";
}

/** shouldRenotifyNoData notifies under NOTIFY_NO_DATA after `intervalMinutes` of sustained NO_DATA, then on the renotify cadence. */
function shouldRenotifyNoData(transition: SeverityTransition): boolean {
  const { noData, renotify, prevSeverityChangedAt, now } = transition;
  if (noData.mode !== "NOTIFY_NO_DATA") return false;
  const alertedAt = alertedAtInCurrentStretch(transition);
  if (alertedAt === null) {
    return passedDelay(prevSeverityChangedAt, noData.intervalMinutes, now);
  }
  if (renotify.mode !== "EVERY") return false;
  return passedDelay(alertedAt, renotify.intervalMinutes, now);
}

/** alertedAtInCurrentStretch ignores an alert sent before the current severity began. */
function alertedAtInCurrentStretch({
  prevAlertedAt,
  prevSeverityChangedAt,
}: SeverityTransition): Date | null {
  if (prevAlertedAt === null || prevSeverityChangedAt === null) {
    return prevAlertedAt;
  }
  if (prevAlertedAt < prevSeverityChangedAt) return null;
  return prevAlertedAt;
}

/** isNotChangingSeverity matches a transition whose severity stays the same. */
function isNotChangingSeverity({
  prevSeverity,
  nextSeverity,
}: SeverityTransition): boolean {
  return prevSeverity === nextSeverity;
}

/** shouldRenotifyWhenNotChangingSeverity re-notifies a sustained WARNING or ALERT on the renotify cadence; OK never re-notifies. */
function shouldRenotifyWhenNotChangingSeverity({
  nextSeverity,
  prevAlertedAt,
  renotify,
  now,
}: SeverityTransition): boolean {
  if (nextSeverity === "OK" || prevAlertedAt === null) return false;
  if (renotify.mode !== "EVERY") return false;
  return passedDelay(prevAlertedAt, renotify.intervalMinutes, now);
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

/** SeverityTransition is the input shouldEmit and its helpers read to decide whether a severity change notifies. */
type SeverityTransition = {
  prevSeverity: MonitorSeverity;
  nextSeverity: MonitorSeverity;
  prevAlertedAt: Date | null;
  prevSeverityChangedAt: Date | null;
  now: Date;
  noData: MonitorNoData;
  renotify: MonitorRenotify;
};
