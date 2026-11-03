import {
  formatLegacyScheduleDate,
  LEGACY_EVALS_EXPORTS_STOP_DATE,
  LEGACY_FULL_CUT_DATE,
} from "@/src/features/public-api/server/legacyApiShutdownSchedule";
import type { RouterOutputs } from "@/src/utils/api";

const V4_DOCS_URL = "https://langfuse.com/docs/v4";

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

/** Docs link, or the word that opens the migration panel. */
type V4MigrationTopBannerLink =
  | { kind: "docs"; label: string; href: string }
  | { kind: "panel"; label: string };

/** A sentence broken into plain text and the one or two inline links. */
type V4MigrationTopBannerPart = string | V4MigrationTopBannerLink;

export type V4MigrationTopBannerContent = {
  severity: "warning" | "critical";
  parts: V4MigrationTopBannerPart[];
};

const docs = (label: string): V4MigrationTopBannerLink => ({
  kind: "docs",
  label,
  href: V4_DOCS_URL,
});

const panel = (label: string): V4MigrationTopBannerLink => ({
  kind: "panel",
  label,
});

const stillUse = (count: number) =>
  `${count} ${count === 1 ? "project still uses" : "projects still use"}`;

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

function formatClock(date: Date, timeZone: string | undefined) {
  const time = formatWindowTime(date, timeZone);
  const zone = formatTimeZoneName(date, timeZone);
  return zone ? `${time} ${zone}` : time;
}

/** "15:00 to 18:00 GMT+1" in the viewer's timezone. */
function formatWindowRange(
  start: Date,
  end: Date,
  timeZone: string | undefined,
) {
  const range = `${formatWindowTime(start, timeZone)} to ${formatWindowTime(end, timeZone)}`;
  const zone = formatTimeZoneName(start, timeZone);
  return zone ? `${range} ${zone}` : range;
}

function localDayKey(date: Date, timeZone: string | undefined) {
  return date.toLocaleDateString("en-CA", { timeZone });
}

/** formatWindowDay says "today", "tomorrow" or "on Nov 17" relative to `now`. */
function formatWindowDay(start: Date, now: Date, timeZone: string | undefined) {
  const startDay = localDayKey(start, timeZone);
  if (startDay === localDayKey(now, timeZone)) return "today";
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (startDay === localDayKey(tomorrow, timeZone)) return "tomorrow";
  return `on ${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })}`;
}

/**
 * The fix word opens the panel for owners and admins. Members get the same
 * sentence with that word replaced by a pointer at an admin.
 */
function fix(
  canManageIntegrations: boolean,
  adminTail: V4MigrationTopBannerPart[],
  memberTail: string,
): V4MigrationTopBannerPart[] {
  return canManageIntegrations ? adminTail : [memberTail];
}

/**
 * getV4MigrationTopBannerContent builds one short sentence per phase.
 * Nov 16 stops evaluators and exports. Brownouts pause ingestion and APIs.
 * Nov 19 turns ingestion and APIs off. Times render in the viewer's timezone
 * (`timeZone` pins tests). Orange (`warning`) until a surface is actually off;
 * red (`critical`) during a brownout and after the cut.
 */
export function getV4MigrationTopBannerContent(params: {
  phase: V4MigrationTopBannerPhase;
  state: Pick<
    LegacyApiBannerState,
    "serverNow" | "activeWindow" | "nextWindow"
  >;
  actionNeededCount: number;
  canManageIntegrations: boolean;
  timeZone?: string;
}): V4MigrationTopBannerContent {
  const { phase, state, actionNeededCount, canManageIntegrations, timeZone } =
    params;
  const stopDate = formatLegacyScheduleDate(
    LEGACY_EVALS_EXPORTS_STOP_DATE,
    "short",
  );
  const cutDate = formatLegacyScheduleDate(LEGACY_FULL_CUT_DATE, "short");

  if (phase === "amber") {
    return {
      severity: "warning",
      parts: [
        `${stillUse(actionNeededCount)} `,
        docs("legacy v3 features like ingestion, APIs, evals and exports"),
        ". ",
        ...fix(
          canManageIntegrations,
          [panel("Update"), ` before ${stopDate}.`],
          `Ask an admin before ${stopDate}.`,
        ),
      ],
    };
  }

  if (phase === "cut") {
    return {
      severity: "critical",
      parts: [
        docs("Legacy v3 ingestion, APIs, evals and exports"),
        " are turned off. ",
        ...fix(
          canManageIntegrations,
          [panel("Update"), " now."],
          "Ask an admin now.",
        ),
      ],
    };
  }

  const window =
    phase === "brownout_active" ? state.activeWindow : state.nextWindow;
  if (!window) {
    return {
      severity: "warning",
      parts: [
        docs("Legacy v3 ingestion and APIs"),
        ` shut off ${cutDate}. Evals and exports are already off. `,
        ...fix(
          canManageIntegrations,
          [panel("Update"), " now."],
          "Ask an admin now.",
        ),
      ],
    };
  }

  return {
    // Orange until the ingestion and API pause starts. Red while it is on.
    severity: phase === "brownout_active" ? "critical" : "warning",
    parts:
      phase === "brownout_active"
        ? [
            docs("Legacy v3 ingestion and APIs"),
            ` are paused until ${formatClock(window.endsAt, timeZone)}. Evals and exports stay off. `,
            ...fix(
              canManageIntegrations,
              [panel("Update"), " now."],
              "Ask an admin now.",
            ),
          ]
        : [
            docs("Legacy v3 ingestion and APIs"),
            ` pause ${formatWindowDay(window.startsAt, state.serverNow, timeZone)} ${formatWindowRange(window.startsAt, window.endsAt, timeZone)}. Evals and exports are already off. `,
            ...fix(
              canManageIntegrations,
              [panel("Update"), " now."],
              "Ask an admin now.",
            ),
          ],
  };
}
