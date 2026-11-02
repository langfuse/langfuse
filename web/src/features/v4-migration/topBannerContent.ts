import {
  formatLegacyScheduleDate,
  LEGACY_EVALS_EXPORTS_STOP_DATE,
  LEGACY_FULL_CUT_DATE,
  type LegacyApiBrownoutWindow,
} from "@/src/features/public-api/server/legacyApiShutdownSchedule";
import { V4_MIGRATION_LOOKBACK_DAYS } from "@/src/features/v4-migration/migrationData";
import type { RouterOutputs } from "@/src/utils/api";

const V4_DOCS_URL = "https://langfuse.com/docs/v4";
const V4_TIMELINE_URL = `${V4_DOCS_URL}#timeline`;

type LegacyApiBannerState =
  RouterOutputs["v4Transition"]["legacyApiBannerState"];

export type V4MigrationTopBannerPhase =
  | "amber"
  | "brownout_day"
  | "brownout_active"
  | "cut";

/**
 * getV4MigrationTopBannerPhase combines the server phase with what only the
 * client knows; null hides the banner. Waits for every project check so the
 * counts never jump after the banner appears.
 */
export function getV4MigrationTopBannerPhase(params: {
  serverPhase: LegacyApiBannerState["phase"] | undefined;
  v4UpgradeUiEnabled: boolean;
  isLangfuseCloud: boolean;
  actionNeededCount: number;
  isChecking: boolean;
}): V4MigrationTopBannerPhase | null {
  const {
    serverPhase,
    v4UpgradeUiEnabled,
    isLangfuseCloud,
    actionNeededCount,
    isChecking,
  } = params;
  if (
    !serverPhase ||
    serverPhase === "hidden" ||
    !v4UpgradeUiEnabled ||
    !isLangfuseCloud ||
    isChecking ||
    actionNeededCount === 0
  ) {
    return null;
  }
  return serverPhase === "before_stop" ? "amber" : serverPhase;
}

export type V4MigrationTopBannerContent = {
  severity: "warning" | "critical";
  title: string;
  body: string;
  /** Opens the migration panel; null for members who cannot fix integrations. */
  primaryCtaLabel: string | null;
  secondaryLink: { label: string; href: string };
  /** Only the amber phase may be closed, and only for the browser session. */
  closable: boolean;
};

const projects = (count: number) =>
  `${count} ${count === 1 ? "project" : "projects"}`;

/** formatWindowTime renders "16:00" in the viewer's timezone (or `timeZone`). */
function formatWindowTime(date: Date, timeZone: string | undefined) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
}

function formatTimeZoneName(date: Date, timeZone: string | undefined) {
  return (
    new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  );
}

function localDayKey(date: Date, timeZone: string | undefined) {
  return date.toLocaleDateString("en-CA", { timeZone });
}

/** formatWindowDay says "today", "tomorrow" or "on Nov 17" relative to `now`, in the viewer's timezone. */
function formatWindowDay(start: Date, now: Date, timeZone: string | undefined) {
  const startDay = localDayKey(start, timeZone);
  if (startDay === localDayKey(now, timeZone)) return "today";
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (startDay === localDayKey(tomorrow, timeZone)) return "tomorrow";
  return `on ${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })}`;
}

function brownoutTitle(
  window: LegacyApiBrownoutWindow,
  now: Date,
  timeZone: string | undefined,
) {
  const day = formatWindowDay(window.startsAt, now, timeZone);
  const start = formatWindowTime(window.startsAt, timeZone);
  const end = formatWindowTime(window.endsAt, timeZone);
  const zone = formatTimeZoneName(window.endsAt, timeZone);
  return `Legacy APIs are paused ${day} ${start} to ${end}${zone ? ` ${zone}` : ""}`;
}

/**
 * getV4MigrationTopBannerContent builds the copy per phase. Calendar dates come
 * from the schedule as announced; brownout times render in the viewer's local
 * timezone (`timeZone` pins it in tests).
 */
export function getV4MigrationTopBannerContent(params: {
  phase: V4MigrationTopBannerPhase;
  state: Pick<
    LegacyApiBannerState,
    "serverNow" | "activeWindow" | "nextWindow"
  >;
  actionNeededCount: number;
  totalProjects: number;
  canManageIntegrations: boolean;
  timeZone?: string;
}): V4MigrationTopBannerContent {
  const {
    phase,
    state,
    actionNeededCount,
    totalProjects,
    canManageIntegrations,
    timeZone,
  } = params;
  const stopDate = formatLegacyScheduleDate(
    LEGACY_EVALS_EXPORTS_STOP_DATE,
    "short",
  );
  const cutDate = formatLegacyScheduleDate(LEGACY_FULL_CUT_DATE, "short");
  const memberNote = canManageIntegrations
    ? ""
    : " Ask an admin to update integrations.";
  const cta = (label: string) => (canManageIntegrations ? label : null);
  const upgradeGuide = { label: "Upgrade guide", href: V4_DOCS_URL };

  if (phase === "amber") {
    return {
      severity: "warning",
      title: `Action needed before ${stopDate}`,
      body: `${actionNeededCount} of ${projects(totalProjects)} still ${actionNeededCount === 1 ? "uses" : "use"} legacy APIs. Legacy evaluators and exports stop ${stopDate}. Legacy ingestion and APIs shut off ${cutDate}. Based on the last ${V4_MIGRATION_LOOKBACK_DAYS} days of traffic.${memberNote}`,
      primaryCtaLabel: cta("Review what to update"),
      secondaryLink: upgradeGuide,
      closable: true,
    };
  }

  if (phase === "cut") {
    return {
      severity: "critical",
      title: "Legacy APIs are off",
      body: `${projects(actionNeededCount)} ${actionNeededCount === 1 ? "is" : "are"} sending requests that fail. Update SDKs (Python 4+, JS 5+) or switch to OpenTelemetry.${memberNote}`,
      primaryCtaLabel: cta("See failing projects"),
      secondaryLink: upgradeGuide,
      closable: false,
    };
  }

  const window =
    phase === "brownout_active" ? state.activeWindow : state.nextWindow;
  return {
    severity: "critical",
    title: window
      ? brownoutTitle(window, state.serverNow, timeZone)
      : `Legacy APIs shut off ${cutDate}`,
    body: `Legacy evaluators and exports have stopped. Requests from ${projects(actionNeededCount)} will fail ${window ? "during this window" : "from then on"}.${memberNote}`,
    primaryCtaLabel: cta("Fix now"),
    secondaryLink: { label: "Brownout schedule", href: V4_TIMELINE_URL },
    closable: false,
  };
}
