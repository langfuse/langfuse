import { afterEach, describe, expect, it, vi } from "vitest";
import { V3_SUNSET_DATE } from "@/src/features/public-api/server/deprecations";
import {
  formatLegacyScheduleDate,
  getLegacyApiShutdownStatus,
  LEGACY_API_SHUTDOWN_SCHEDULE,
  LEGACY_EVALS_EXPORTS_STOP_DATE,
  LEGACY_FULL_CUT_DATE,
} from "@/src/features/public-api/server/legacyApiShutdownSchedule";
import {
  createStaticLegacyApiBannerSource,
  getLegacyApiBannerState,
  resolveLegacyApiBannerNow,
} from "@/src/features/v4-migration/server/legacyApiBannerSource";

const schedule = LEGACY_API_SHUTDOWN_SCHEDULE;
const statusAt = (iso: string) =>
  getLegacyApiShutdownStatus(schedule, new Date(iso));
const MS = 1;
const before = (date: Date) => new Date(date.getTime() - MS).toISOString();
const at = (date: Date) => date.toISOString();

describe("LEGACY_API_SHUTDOWN_SCHEDULE", () => {
  it("stops evaluators and exports on the v3 sunset date", () => {
    expect(LEGACY_EVALS_EXPORTS_STOP_DATE).toBe(V3_SUNSET_DATE);
    expect(schedule.evalsExportsStopAt.toISOString().slice(0, 10)).toBe(
      V3_SUNSET_DATE,
    );
    expect(schedule.fullCutAt.toISOString().slice(0, 10)).toBe(
      LEGACY_FULL_CUT_DATE,
    );
  });

  it("stores the Europe/Berlin brownout windows as CET (UTC+1) instants", () => {
    const berlin = (date: Date) =>
      date.toLocaleString("sv-SE", { timeZone: "Europe/Berlin" });
    expect(
      schedule.brownoutWindows.map((window) => [
        berlin(window.startsAt),
        berlin(window.endsAt),
      ]),
    ).toEqual([
      ["2026-11-16 16:00:00", "2026-11-16 17:00:00"],
      ["2026-11-17 15:00:00", "2026-11-17 18:00:00"],
      ["2026-11-18 14:00:00", "2026-11-18 20:00:00"],
    ]);
  });

  it("orders stop < windows < cut without overlaps", () => {
    let cursor = schedule.evalsExportsStopAt.getTime();
    for (const window of schedule.brownoutWindows) {
      expect(window.startsAt.getTime()).toBeGreaterThanOrEqual(cursor);
      expect(window.endsAt.getTime()).toBeGreaterThan(
        window.startsAt.getTime(),
      );
      cursor = window.endsAt.getTime();
    }
    expect(schedule.fullCutAt.getTime()).toBeGreaterThan(cursor);
  });

  it("formats the announced calendar dates regardless of the stop time", () => {
    expect(
      formatLegacyScheduleDate(LEGACY_EVALS_EXPORTS_STOP_DATE, "long"),
    ).toBe("November 16, 2026");
    expect(formatLegacyScheduleDate(LEGACY_FULL_CUT_DATE, "short")).toBe(
      "Nov 19",
    );
  });
});

describe("getLegacyApiShutdownStatus", () => {
  const [day1, day2, day3] = schedule.brownoutWindows;

  it("is before_stop until the evaluator/export stop, then brownout_day", () => {
    expect(statusAt("2026-11-02T12:00:00Z")).toEqual({
      phase: "before_stop",
      activeWindow: null,
      nextWindow: day1,
    });
    expect(statusAt(before(schedule.evalsExportsStopAt)).phase).toBe(
      "before_stop",
    );
    expect(statusAt(at(schedule.evalsExportsStopAt))).toEqual({
      phase: "brownout_day",
      activeWindow: null,
      nextWindow: day1,
    });
  });

  it.each([
    ["Nov 16", day1!],
    ["Nov 17", day2!],
    ["Nov 18", day3!],
  ])("enters and leaves the %s window at its exact bounds", (_, window) => {
    expect(statusAt(before(window.startsAt))).toMatchObject({
      phase: "brownout_day",
      activeWindow: null,
      nextWindow: window,
    });
    expect(statusAt(at(window.startsAt))).toMatchObject({
      phase: "brownout_active",
      activeWindow: window,
    });
    expect(statusAt(before(window.endsAt))).toMatchObject({
      phase: "brownout_active",
      activeWindow: window,
    });
    expect(statusAt(at(window.endsAt))).toMatchObject({
      phase: "brownout_day",
      activeWindow: null,
    });
  });

  it("matches the Berlin wall-clock bounds", () => {
    // 16:00 Berlin on Nov 16 is 15:00 UTC.
    expect(statusAt("2026-11-16T15:59:59+01:00").phase).toBe("brownout_day");
    expect(statusAt("2026-11-16T16:00:00+01:00").phase).toBe("brownout_active");
    expect(statusAt("2026-11-16T16:59:59+01:00").phase).toBe("brownout_active");
    expect(statusAt("2026-11-16T17:00:00+01:00").phase).toBe("brownout_day");
    expect(statusAt("2026-11-17T15:00:00+01:00").phase).toBe("brownout_active");
    expect(statusAt("2026-11-17T18:00:00+01:00").phase).toBe("brownout_day");
    expect(statusAt("2026-11-18T14:00:00+01:00").phase).toBe("brownout_active");
    expect(statusAt("2026-11-18T19:59:59+01:00").phase).toBe("brownout_active");
    expect(statusAt("2026-11-18T20:00:00+01:00").phase).toBe("brownout_day");
  });

  it("points at the next day's window between windows, and none after the last", () => {
    expect(statusAt(at(day1!.endsAt)).nextWindow).toEqual(day2);
    expect(statusAt(at(day3!.endsAt)).nextWindow).toBeNull();
  });

  it("is cut from the full-cut instant on", () => {
    expect(statusAt(before(schedule.fullCutAt)).phase).toBe("brownout_day");
    expect(statusAt(at(schedule.fullCutAt))).toEqual({
      phase: "cut",
      activeWindow: null,
      nextWindow: null,
    });
    expect(statusAt("2027-01-01T00:00:00Z").phase).toBe("cut");
  });
});

describe("getLegacyApiBannerState", () => {
  const source = createStaticLegacyApiBannerSource(["org-exempt"]);
  const now = new Date("2026-11-17T14:30:00Z");

  it("returns the schedule phase computed with the given clock", async () => {
    await expect(
      getLegacyApiBannerState({
        source,
        orgId: "org-a",
        now,
        isLangfuseCloud: true,
      }),
    ).resolves.toEqual({
      phase: "brownout_active",
      exempt: false,
      serverNow: now,
      evalsExportsStopAt: schedule.evalsExportsStopAt,
      fullCutAt: schedule.fullCutAt,
      activeWindow: schedule.brownoutWindows[1],
      nextWindow: schedule.brownoutWindows[2],
    });
  });

  it("hides the banner for exempt orgs and self-hosted deployments", async () => {
    await expect(
      getLegacyApiBannerState({
        source,
        orgId: "org-exempt",
        now,
        isLangfuseCloud: true,
      }),
    ).resolves.toMatchObject({ phase: "hidden", exempt: true });
    await expect(
      getLegacyApiBannerState({
        source,
        orgId: "org-a",
        now,
        isLangfuseCloud: false,
      }),
    ).resolves.toMatchObject({ phase: "hidden", exempt: false });
  });

  it("accepts an async source so the schedule can come from elsewhere", async () => {
    const state = await getLegacyApiBannerState({
      source: {
        getSchedule: async () => ({ ...schedule, brownoutWindows: [] }),
        isOrganizationExempt: async () => false,
      },
      orgId: "org-a",
      now,
      isLangfuseCloud: true,
    });
    expect(state.phase).toBe("brownout_day");
    expect(state.nextWindow).toBeNull();
  });
});

describe("resolveLegacyApiBannerNow", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  const nowOverride = "2026-11-19T10:00:00Z";

  it("ignores the override for regular users on production deployments", () => {
    expect(
      resolveLegacyApiBannerNow({
        nowOverride,
        isAdmin: false,
        isPreviewDeployment: false,
        now,
      }),
    ).toBe(now);
  });

  it("honors the override for admins and on previews", () => {
    expect(
      resolveLegacyApiBannerNow({
        nowOverride,
        isAdmin: true,
        isPreviewDeployment: false,
        now,
      }).toISOString(),
    ).toBe("2026-11-19T10:00:00.000Z");
    expect(
      resolveLegacyApiBannerNow({
        nowOverride,
        isAdmin: false,
        isPreviewDeployment: true,
        now,
      }).toISOString(),
    ).toBe("2026-11-19T10:00:00.000Z");
  });

  it("falls back to the real clock on an unparsable override", () => {
    expect(
      resolveLegacyApiBannerNow({
        nowOverride: "not-a-date",
        isAdmin: true,
        isPreviewDeployment: true,
        now,
      }),
    ).toBe(now);
  });
});

describe("LANGFUSE_V4_BANNER_EXEMPT_ORG_IDS", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  async function loadSource(value: string | undefined) {
    vi.resetModules();
    process.env = { ...originalEnv };
    if (value === undefined) {
      delete process.env.LANGFUSE_V4_BANNER_EXEMPT_ORG_IDS;
    } else {
      process.env.LANGFUSE_V4_BANNER_EXEMPT_ORG_IDS = value;
    }
    const { legacyApiBannerSource } =
      await import("@/src/features/v4-migration/server/legacyApiBannerSource");
    return legacyApiBannerSource;
  }

  it("exempts each trimmed, comma-separated org id", async () => {
    const source = await loadSource(" org-yelp , ,org-b");
    expect(source.isOrganizationExempt("org-yelp")).toBe(true);
    expect(source.isOrganizationExempt("org-b")).toBe(true);
    expect(source.isOrganizationExempt("org-c")).toBe(false);
    expect(source.isOrganizationExempt("")).toBe(false);
  });

  it("exempts nobody when unset", async () => {
    const source = await loadSource(undefined);
    expect(source.isOrganizationExempt("org-yelp")).toBe(false);
  });
});
