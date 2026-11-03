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
 * getV4MigrationTopBannerContent builds one short sentence per phase. Dates,
 * the detection window and the brownout schedule live in the migration panel.
 * Brownout times render in the viewer's local timezone (`timeZone` pins tests).
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
        docs("legacy APIs"),
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
        docs("Legacy APIs"),
        " are off. ",
        ...fix(
          canManageIntegrations,
          [
            panel("Update"),
            ` ${actionNeededCount === 1 ? "the project" : `${actionNeededCount} projects`} still using them.`,
          ],
          "Ask an admin.",
        ),
      ],
    };
  }

  const window =
    phase === "brownout_active" ? state.activeWindow : state.nextWindow;
  if (!window) {
    return {
      severity: "critical",
      parts: [
        docs("Legacy APIs"),
        ` shut off ${cutDate}. `,
        ...fix(
          canManageIntegrations,
          [panel("Update"), " before then."],
          "Ask an admin.",
        ),
      ],
    };
  }

  return {
    severity: "critical",
    parts:
      phase === "brownout_active"
        ? [
            docs("Legacy APIs"),
            ` are paused until ${formatClock(window.endsAt, timeZone)}. `,
            ...fix(
              canManageIntegrations,
              [panel("Update"), " now."],
              "Ask an admin.",
            ),
          ]
        : [
            docs("Legacy APIs"),
            ` pause ${formatWindowDay(window.startsAt, state.serverNow, timeZone)} at ${formatClock(window.startsAt, timeZone)}. `,
            ...fix(
              canManageIntegrations,
              [panel("Update"), " before then."],
              "Ask an admin.",
            ),
          ],
  };
}
