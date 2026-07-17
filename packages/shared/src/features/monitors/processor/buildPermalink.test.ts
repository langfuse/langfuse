import { describe, it, expect, vi, beforeEach } from "vitest";

const envMock = vi.hoisted(() => ({
  env: { NEXTAUTH_URL: undefined as string | undefined },
}));
vi.mock("../../../env", () => envMock);

import {
  buildDataWindowPermalink,
  buildPermalink,
  isBreaching,
} from "./processor";

describe("buildPermalink", () => {
  beforeEach(() => {
    envMock.env.NEXTAUTH_URL = undefined;
  });

  it("returns undefined when NEXTAUTH_URL is unset (self-hosted)", () => {
    expect(buildPermalink("proj_01", "mon_01")).toBeUndefined();
  });

  it("returns an absolute URL when NEXTAUTH_URL is set", () => {
    envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
    expect(buildPermalink("proj_01", "mon_01")).toBe(
      "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
    );
  });
});

describe("buildDataWindowPermalink", () => {
  const from = new Date("2026-05-18T11:55:30.000Z"); // 1779450930000
  const to = new Date("2026-05-18T12:00:30.000Z"); // 1779451230000

  beforeEach(() => {
    envMock.env.NEXTAUTH_URL = undefined;
  });

  it("returns undefined when NEXTAUTH_URL is unset (self-hosted)", () => {
    expect(
      buildDataWindowPermalink("proj_01", "observations", from, to),
    ).toBeUndefined();
  });

  it("links an observations monitor to the observations table windowed by dateRange", () => {
    envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
    expect(buildDataWindowPermalink("proj_01", "observations", from, to)).toBe(
      `https://cloud.langfuse.com/project/proj_01/observations?dateRange=${from.getTime()}-${to.getTime()}`,
    );
  });

  it.each(["scores-numeric", "scores-categorical"] as const)(
    "links a %s monitor to the traces table windowed by dateRange",
    (view) => {
      envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
      expect(buildDataWindowPermalink("proj_01", view, from, to)).toBe(
        `https://cloud.langfuse.com/project/proj_01/traces?dateRange=${from.getTime()}-${to.getTime()}`,
      );
    },
  );

  it("strips a trailing slash on NEXTAUTH_URL", () => {
    envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com/";
    expect(buildDataWindowPermalink("proj_01", "observations", from, to)).toBe(
      `https://cloud.langfuse.com/project/proj_01/observations?dateRange=${from.getTime()}-${to.getTime()}`,
    );
  });
});

describe("isBreaching", () => {
  it.each(["ALERT", "WARNING"] as const)(
    "treats %s as a breach (gets a data-window link)",
    (severity) => {
      expect(isBreaching(severity)).toBe(true);
    },
  );

  it.each(["OK", "NO_DATA", "UNKNOWN", "PAUSED"] as const)(
    "treats %s as a non-breach (no data-window link)",
    (severity) => {
      expect(isBreaching(severity)).toBe(false);
    },
  );
});
