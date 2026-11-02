import { describe, expect, it } from "vitest";
import { LEGACY_API_SHUTDOWN_SCHEDULE } from "@/src/features/public-api/server/legacyApiShutdownSchedule";
import {
  getV4MigrationTopBannerContent,
  getV4MigrationTopBannerPhase,
} from "./topBannerContent";

const [day1, day2, day3] = LEGACY_API_SHUTDOWN_SCHEDULE.brownoutWindows;

const visible = {
  serverPhase: "before_stop",
  v4UpgradeUiEnabled: true,
  isLangfuseCloud: true,
  actionNeededCount: 2,
  isChecking: false,
} as const;

describe("getV4MigrationTopBannerPhase", () => {
  it("maps the server phases to banner phases", () => {
    expect(getV4MigrationTopBannerPhase(visible)).toBe("amber");
    for (const serverPhase of [
      "brownout_day",
      "brownout_active",
      "cut",
    ] as const) {
      expect(getV4MigrationTopBannerPhase({ ...visible, serverPhase })).toBe(
        serverPhase,
      );
    }
  });

  it.each([
    ["the server hides it (exempt or self-hosted)", { serverPhase: "hidden" }],
    ["the server state is loading", { serverPhase: undefined }],
    ["the v4 upgrade UI is off", { v4UpgradeUiEnabled: false }],
    ["the deployment is self-hosted", { isLangfuseCloud: false }],
    ["no project needs action", { actionNeededCount: 0 }],
    ["project checks are still loading", { isChecking: true }],
  ] as const)("is hidden when %s", (_, override) => {
    expect(getV4MigrationTopBannerPhase({ ...visible, ...override })).toBe(
      null,
    );
  });
});

const content = (
  params: Partial<Parameters<typeof getV4MigrationTopBannerContent>[0]>,
) =>
  getV4MigrationTopBannerContent({
    phase: "amber",
    state: {
      serverNow: new Date("2026-11-02T12:00:00Z"),
      activeWindow: null,
      nextWindow: day1!,
    },
    actionNeededCount: 2,
    totalProjects: 5,
    canManageIntegrations: true,
    timeZone: "Europe/Berlin",
    ...params,
  });

describe("getV4MigrationTopBannerContent", () => {
  it("amber: warns ahead of both dates and may be closed", () => {
    expect(content({})).toEqual({
      severity: "warning",
      title: "Action needed before Nov 16",
      body: "2 of 5 projects still use legacy APIs. Legacy evaluators and exports stop Nov 16. Legacy ingestion and APIs shut off Nov 19. Based on the last 3 days of traffic.",
      primaryCtaLabel: "Review what to update",
      secondaryLink: {
        label: "Upgrade guide",
        href: "https://langfuse.com/docs/v4",
      },
      closable: true,
    });
    expect(content({ actionNeededCount: 1, totalProjects: 1 }).body).toMatch(
      /^1 of 1 project still uses legacy APIs\./,
    );
  });

  it("brownout day: names the next window in the viewer's timezone", () => {
    const berlin = content({
      phase: "brownout_day",
      state: {
        serverNow: new Date("2026-11-17T09:30:00Z"),
        activeWindow: null,
        nextWindow: day2!,
      },
    });
    expect(berlin).toMatchObject({
      severity: "critical",
      title: "Legacy APIs are paused today 15:00 to 18:00 GMT+1",
      body: "Legacy evaluators and exports have stopped. Requests from 2 projects will fail during this window.",
      primaryCtaLabel: "Fix now",
      secondaryLink: {
        label: "Brownout schedule",
        href: "https://langfuse.com/docs/v4#timeline",
      },
      closable: false,
    });

    const newYork = content({
      phase: "brownout_day",
      timeZone: "America/New_York",
      state: {
        serverNow: new Date("2026-11-17T09:30:00Z"),
        activeWindow: null,
        nextWindow: day2!,
      },
    });
    expect(newYork.title).toBe(
      "Legacy APIs are paused today 09:00 to 12:00 EST",
    );
  });

  it("brownout day: says tomorrow after the day's window has passed", () => {
    expect(
      content({
        phase: "brownout_day",
        state: {
          serverNow: day1!.endsAt,
          activeWindow: null,
          nextWindow: day2!,
        },
      }).title,
    ).toBe("Legacy APIs are paused tomorrow 15:00 to 18:00 GMT+1");
  });

  it("brownout day: points at the cut once the last window has passed", () => {
    expect(
      content({
        phase: "brownout_day",
        state: {
          serverNow: day3!.endsAt,
          activeWindow: null,
          nextWindow: null,
        },
      }),
    ).toMatchObject({
      title: "Legacy APIs shut off Nov 19",
      body: "Legacy evaluators and exports have stopped. Requests from 2 projects will fail from then on.",
    });
  });

  it("brownout active: names the current window", () => {
    expect(
      content({
        phase: "brownout_active",
        actionNeededCount: 1,
        state: {
          serverNow: new Date("2026-11-18T15:00:00Z"),
          activeWindow: day3!,
          nextWindow: null,
        },
      }),
    ).toMatchObject({
      severity: "critical",
      title: "Legacy APIs are paused today 14:00 to 20:00 GMT+1",
      body: "Legacy evaluators and exports have stopped. Requests from 1 project will fail during this window.",
      closable: false,
    });
  });

  it("cut: reports failing projects and cannot be closed", () => {
    expect(content({ phase: "cut", actionNeededCount: 3 })).toEqual({
      severity: "critical",
      title: "Legacy APIs are off",
      body: "3 projects are sending requests that fail. Update SDKs (Python 4+, JS 5+) or switch to OpenTelemetry.",
      primaryCtaLabel: "See failing projects",
      secondaryLink: {
        label: "Upgrade guide",
        href: "https://langfuse.com/docs/v4",
      },
      closable: false,
    });
  });

  it.each(["amber", "brownout_day", "brownout_active", "cut"] as const)(
    "%s: members get no fix action and are pointed at an admin",
    (phase) => {
      const member = content({
        phase,
        canManageIntegrations: false,
        state: {
          serverNow: new Date("2026-11-18T15:00:00Z"),
          activeWindow: day3!,
          nextWindow: day3!,
        },
      });
      expect(member.primaryCtaLabel).toBeNull();
      expect(member.body).toMatch(/ Ask an admin to update integrations\.$/);
      expect(member.secondaryLink.href).toMatch(/^https:\/\/langfuse\.com/);
    },
  );
});
