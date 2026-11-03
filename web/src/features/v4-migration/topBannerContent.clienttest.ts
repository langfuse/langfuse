import { describe, expect, it } from "vitest";
import { LEGACY_API_SHUTDOWN_SCHEDULE } from "@/src/features/public-api/server/legacyApiShutdownSchedule";
import {
  getV4MigrationTopBannerContent,
  getV4MigrationTopBannerPhase,
  type V4MigrationTopBannerContent,
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
    canManageIntegrations: true,
    timeZone: "Europe/Berlin",
    ...params,
  });

const sentence = (value: V4MigrationTopBannerContent) =>
  value.parts
    .map((part) => (typeof part === "string" ? part : part.label))
    .join("");

const panelLabel = (value: V4MigrationTopBannerContent) =>
  value.parts.find((part) => typeof part !== "string" && part.kind === "panel");

const docsLink = (value: V4MigrationTopBannerContent) =>
  value.parts.find((part) => typeof part !== "string" && part.kind === "docs");

describe("getV4MigrationTopBannerContent", () => {
  it("amber: one sentence with a docs word and an update word", () => {
    const amber = content({});
    expect(amber.severity).toBe("warning");
    expect(sentence(amber)).toBe(
      "2 projects still use legacy APIs. Update before Nov 16.",
    );
    expect(docsLink(amber)).toEqual({
      kind: "docs",
      label: "legacy APIs",
      href: "https://langfuse.com/docs/v4",
    });
    expect(panelLabel(amber)).toEqual({ kind: "panel", label: "Update" });
    expect(sentence(content({ actionNeededCount: 1 }))).toBe(
      "1 project still uses legacy APIs. Update before Nov 16.",
    );
  });

  it("brownout day: names the next pause in the viewer's timezone", () => {
    const berlin = content({
      phase: "brownout_day",
      state: {
        serverNow: new Date("2026-11-17T09:30:00Z"),
        activeWindow: null,
        nextWindow: day2!,
      },
    });
    expect(berlin.severity).toBe("critical");
    expect(sentence(berlin)).toBe(
      "Legacy APIs pause today at 15:00 GMT+1. Update before then.",
    );
    expect(docsLink(berlin)).toMatchObject({
      kind: "docs",
      label: "Legacy APIs",
      href: "https://langfuse.com/docs/v4",
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
    expect(sentence(newYork)).toBe(
      "Legacy APIs pause today at 09:00 EST. Update before then.",
    );
  });

  it("brownout day: says tomorrow after the day's window has passed", () => {
    expect(
      sentence(
        content({
          phase: "brownout_day",
          state: {
            serverNow: day1!.endsAt,
            activeWindow: null,
            nextWindow: day2!,
          },
        }),
      ),
    ).toBe("Legacy APIs pause tomorrow at 15:00 GMT+1. Update before then.");
  });

  it("brownout day: points at the cut once the last window has passed", () => {
    expect(
      sentence(
        content({
          phase: "brownout_day",
          state: {
            serverNow: day3!.endsAt,
            activeWindow: null,
            nextWindow: null,
          },
        }),
      ),
    ).toBe("Legacy APIs shut off Nov 19. Update before then.");
  });

  it("brownout active: names when the pause ends", () => {
    const active = content({
      phase: "brownout_active",
      actionNeededCount: 1,
      state: {
        serverNow: new Date("2026-11-18T15:00:00Z"),
        activeWindow: day3!,
        nextWindow: null,
      },
    });
    expect(active.severity).toBe("critical");
    expect(sentence(active)).toBe(
      "Legacy APIs are paused until 20:00 GMT+1. Update now.",
    );
  });

  it("cut: names the projects still sending failing requests", () => {
    const cut = content({ phase: "cut", actionNeededCount: 3 });
    expect(cut.severity).toBe("critical");
    expect(sentence(cut)).toBe(
      "Legacy APIs are off. Update 3 projects still using them.",
    );
    expect(sentence(content({ phase: "cut", actionNeededCount: 1 }))).toBe(
      "Legacy APIs are off. Update the project still using them.",
    );
    expect(docsLink(cut)).toMatchObject({
      href: "https://langfuse.com/docs/v4",
    });
  });

  it.each(["amber", "brownout_day", "brownout_active", "cut"] as const)(
    "%s: members get no panel link and are pointed at an admin",
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
      expect(panelLabel(member)).toBeUndefined();
      expect(sentence(member)).toMatch(
        phase === "amber" ? /Ask an admin before Nov 16\.$/ : /Ask an admin\.$/,
      );
      expect(docsLink(member)).toMatchObject({
        href: expect.stringMatching(/^https:\/\/langfuse\.com/),
      });
    },
  );
});
