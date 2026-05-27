import type { MonitorNoData, MonitorRenotify, MonitorSeverity } from "../types";
import type { ComputedSeverity } from "./computeSeverity";

/** StateMachineDecision is the post-transition lifecycle stamps the processor writes back to the row, plus the emit flag. */
export type StateMachineDecision = {
  emit: boolean;
  nextSeverity: MonitorSeverity;
  nextSeverityChangedAt: Date | null;
  nextAlertedAt: Date | null;
};

/** applyStateMachine encodes the RFC §Severity State Machine table — given a transition from prev to computed severity, returns whether to emit and the next lifecycle stamps. `now` is the worker wallclock; severityChangedAt/alertedAt are wallclock stamps. */
export function applyStateMachine(args: {
  prevSeverity: MonitorSeverity;
  computedSeverity: ComputedSeverity;
  prevSeverityChangedAt: Date | null;
  prevAlertedAt: Date | null;
  now: Date;
  noData: MonitorNoData;
  renotify: MonitorRenotify;
}): StateMachineDecision {
  const { prevSeverity: prev, computedSeverity: next } = args;

  // PAUSED is service-written; if a user paused the monitor between publish and
  // process, no-op so the worker doesn't overwrite the user's intent.
  if (prev === "PAUSED") {
    return {
      emit: false,
      nextSeverity: "PAUSED",
      nextSeverityChangedAt: args.prevSeverityChangedAt,
      nextAlertedAt: args.prevAlertedAt,
    };
  }

  const severityChanged = prev !== next;

  const emit = shouldEmit({
    prev,
    next,
    prevAlertedAt: args.prevAlertedAt,
    now: args.now,
    noData: args.noData,
    renotify: args.renotify,
  });

  return {
    emit,
    nextSeverity: next,
    nextSeverityChangedAt: severityChanged
      ? args.now
      : args.prevSeverityChangedAt,
    nextAlertedAt: emit ? args.now : args.prevAlertedAt,
  };
}

/** shouldEmit applies the RFC transition table row that matches (prev, next). */
function shouldEmit(args: {
  prev: MonitorSeverity;
  next: ComputedSeverity;
  prevAlertedAt: Date | null;
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

  // Escalation into NO_DATA: NOTIFY mode with cooldown elapsed (NULL prevAlertedAt fires immediately).
  if (args.next === "NO_DATA" && args.prev !== "NO_DATA") {
    return (
      args.noData.mode === "NOTIFY" &&
      passedDelay(args.prevAlertedAt, args.noData.intervalMinutes, args.now)
    );
  }

  // Self-loops. OK -> OK is the only one that ignores renotify entirely.
  if (args.prev === args.next) {
    if (args.next === "OK") return false;
    // Renotify is a *re*-emit, so a NULL prevAlertedAt (no baseline) is silent
    // rather than fire-immediately.
    if (args.prevAlertedAt === null) return false;
    return (
      args.renotify.mode === "EVERY" &&
      passedDelay(args.prevAlertedAt, args.renotify.intervalMinutes, args.now)
    );
  }

  // Remaining severity changes between OK / WARNING / ALERT always emit.
  return true;
}

/** passedDelay returns true when at least `intervalMinutes` has elapsed since `prevAlertedAt`; NULL means no prior emit -> fire immediately. */
function passedDelay(
  prevAlertedAt: Date | null,
  intervalMinutes: number,
  now: Date,
): boolean {
  if (prevAlertedAt === null) return true;
  const intervalMs = intervalMinutes * 60_000;
  return now.getTime() - prevAlertedAt.getTime() >= intervalMs;
}
