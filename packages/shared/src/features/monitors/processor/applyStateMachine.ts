import type {
  MonitorNoData,
  MonitorRenotify,
  MonitorSeverity,
  Monitor,
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
        severity: "PAUSED",
        severityChangedAt: prev.severityChangedAt,
        alertedAt: prev.alertedAt,
      },
    };
  }

  const severityChanged = prev.severity !== next.severity;

  const emit = shouldEmit({
    prev: prev.severity,
    next: next.severity,
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
      severity: next.severity,
      severityChangedAt: severityChanged ? now : prev.severityChangedAt,
      alertedAt: emit ? now : prev.alertedAt,
    },
  };
}

/** shouldEmit applies the RFC transition-table row matching (prev, next). */
function shouldEmit(args: {
  prev: MonitorSeverity;
  next: MonitorSeverity;
  prevAlertedAt: Date | null;
  prevSeverityChangedAt: Date | null;
  now: Date;
  noData: MonitorNoData;
  renotify: MonitorRenotify;
}): boolean {
  // Cold-start: UNKNOWN -> anything. Only unhealthy fires.
  if (args.prev === "UNKNOWN") {
    return args.next === "WARNING" || args.next === "ALERT";
  }

  // Recovery from NO_DATA.
  if (args.prev === "NO_DATA" && args.next === "OK") {
    return args.noData.mode === "NOTIFY";
  }

  // NO_DATA -> WARNING/ALERT always surfaces.
  if (args.prev === "NO_DATA" && args.next !== "NO_DATA") {
    return true;
  }

  // Escalation into NO_DATA: NOTIFY mode with cooldown elapsed.
  if (args.next === "NO_DATA" && args.prev !== "NO_DATA") {
    return (
      args.noData.mode === "NOTIFY" &&
      passedDelay(args.prevAlertedAt, args.noData.intervalMinutes, args.now)
    );
  }

  // NO_DATA persistence: SILENT never re-emits. NOTIFY fires the first alert
  // after intervalMinutes of sustained NO_DATA (anchored on severityChangedAt
  // when no prior alert exists), then re-emits on the renotify cadence.
  if (args.prev === "NO_DATA" && args.next === "NO_DATA") {
    if (args.noData.mode !== "NOTIFY") return false;
    // An alert from a prior severity stretch doesn't count toward the current
    // NO_DATA stretch; treat it as cold-start.
    const stretchAlertedAt =
      args.prevAlertedAt !== null &&
      args.prevSeverityChangedAt !== null &&
      args.prevAlertedAt < args.prevSeverityChangedAt
        ? null
        : args.prevAlertedAt;
    if (stretchAlertedAt === null) {
      return passedDelay(
        args.prevSeverityChangedAt,
        args.noData.intervalMinutes,
        args.now,
      );
    }
    return (
      args.renotify.mode === "EVERY" &&
      passedDelay(stretchAlertedAt, args.renotify.intervalMinutes, args.now)
    );
  }

  // Self-loops. OK -> OK is the only one that ignores renotify entirely.
  if (args.prev === args.next) {
    if (args.next === "OK") return false;
    // Renotify is a *re*-emit, so a NULL prevAlertedAt is silent.
    if (args.prevAlertedAt === null) return false;
    return (
      args.renotify.mode === "EVERY" &&
      passedDelay(args.prevAlertedAt, args.renotify.intervalMinutes, args.now)
    );
  }

  // Remaining severity changes between OK / WARNING / ALERT always emit.
  return true;
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
  severity: MonitorSeverity;
  severityChangedAt: Date | null;
  alertedAt: Date | null;
};

/** StateMachineDecision is the per-monitor evaluation outcome: the lifecycle writeback and whether to emit an alert. */
export type StateMachineDecision = {
  completion: MonitorCompletion;
  emit: boolean;
};
