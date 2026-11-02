import { V3_SUNSET_DATE } from "./deprecations";

// Langfuse Cloud shutdown schedule for the legacy (v3) evaluators, exports,
// ingestion and public APIs — the one place these dates live. The server
// computes the top-banner phase from it and client copy formats its dates, so
// keep this module free of server-only imports.

/** Calendar date (UTC) on which legacy evaluators and exports stop. */
export const LEGACY_EVALS_EXPORTS_STOP_DATE = V3_SUNSET_DATE;
/** Calendar date (UTC) on which legacy ingestion and APIs are switched off. */
export const LEGACY_FULL_CUT_DATE = "2026-11-19";

// PLACEHOLDER: the exact stop and cut times are not decided yet. Both are set
// to 09:00 UTC (10:00 Europe/Berlin) so the calendar date reads the same in
// every timezone from UTC-9 to UTC+14. Replace once the times are final.
export const LEGACY_EVALS_EXPORTS_STOP_TIME_UTC_PLACEHOLDER = "09:00";
export const LEGACY_FULL_CUT_TIME_UTC_PLACEHOLDER = "09:00";

export type LegacyApiBrownoutWindow = {
  startsAt: Date;
  endsAt: Date;
};

export type LegacyApiShutdownSchedule = {
  evalsExportsStopAt: Date;
  /** Sorted by start, non-overlapping, all between the stop and the cut. */
  brownoutWindows: readonly LegacyApiBrownoutWindow[];
  fullCutAt: Date;
};

const utc = (date: string, time: string) => new Date(`${date}T${time}:00Z`);

// Brownouts are announced in Europe/Berlin time, which is CET (UTC+1) in
// November: Nov 16 16:00–17:00, Nov 17 15:00–18:00, Nov 18 14:00–20:00.
export const LEGACY_API_SHUTDOWN_SCHEDULE: LegacyApiShutdownSchedule = {
  evalsExportsStopAt: utc(
    LEGACY_EVALS_EXPORTS_STOP_DATE,
    LEGACY_EVALS_EXPORTS_STOP_TIME_UTC_PLACEHOLDER,
  ),
  brownoutWindows: [
    {
      startsAt: utc("2026-11-16", "15:00"),
      endsAt: utc("2026-11-16", "16:00"),
    },
    {
      startsAt: utc("2026-11-17", "14:00"),
      endsAt: utc("2026-11-17", "17:00"),
    },
    {
      startsAt: utc("2026-11-18", "13:00"),
      endsAt: utc("2026-11-18", "19:00"),
    },
  ],
  fullCutAt: utc(LEGACY_FULL_CUT_DATE, LEGACY_FULL_CUT_TIME_UTC_PLACEHOLDER),
};

export type LegacyApiShutdownPhase =
  /** Legacy surfaces still work; evaluators and exports stop next. */
  | "before_stop"
  /** Evaluators and exports have stopped; APIs work outside brownouts. */
  | "brownout_day"
  /** Inside a brownout window: legacy APIs are paused. */
  | "brownout_active"
  /** Legacy ingestion and APIs are off. */
  | "cut";

export type LegacyApiShutdownStatus = {
  phase: LegacyApiShutdownPhase;
  /** The window `now` falls in (start inclusive, end exclusive). */
  activeWindow: LegacyApiBrownoutWindow | null;
  /** The first window starting after `now`. */
  nextWindow: LegacyApiBrownoutWindow | null;
};

/** getLegacyApiShutdownStatus places `now` on the schedule; boundaries belong to the later phase. */
export function getLegacyApiShutdownStatus(
  schedule: LegacyApiShutdownSchedule,
  now: Date,
): LegacyApiShutdownStatus {
  const time = now.getTime();
  const nextWindow =
    schedule.brownoutWindows.find(
      (window) => window.startsAt.getTime() > time,
    ) ?? null;

  if (time >= schedule.fullCutAt.getTime()) {
    return { phase: "cut", activeWindow: null, nextWindow: null };
  }
  if (time < schedule.evalsExportsStopAt.getTime()) {
    return { phase: "before_stop", activeWindow: null, nextWindow };
  }
  const activeWindow =
    schedule.brownoutWindows.find(
      (window) =>
        window.startsAt.getTime() <= time && time < window.endsAt.getTime(),
    ) ?? null;
  return {
    phase: activeWindow ? "brownout_active" : "brownout_day",
    activeWindow,
    nextWindow,
  };
}

/** formatLegacyScheduleDate renders a schedule calendar date, e.g. "November 16, 2026" or "Nov 16". */
export function formatLegacyScheduleDate(
  isoDate: string,
  style: "long" | "short",
): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: style,
    day: "numeric",
    ...(style === "long" ? { year: "numeric" } : {}),
  });
}
