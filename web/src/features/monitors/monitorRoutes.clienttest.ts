// @vitest-environment node

import { describe, expect, it } from "vitest";

import { renamedRouteRedirects } from "@/redirects.mjs";
import EditMonitorPage from "@/src/features/monitors/pages/EditMonitorPage";

describe("alerts/<id> route", () => {
  it("index route renders the same component as the edit route", async () => {
    const indexRoute =
      await import("@/src/pages/project/[projectId]/alerts/[monitorId]/index");
    const editRoute =
      await import("@/src/pages/project/[projectId]/alerts/[monitorId]/edit");

    expect(indexRoute.default).toBe(EditMonitorPage);
    expect(indexRoute.default).toBe(editRoute.default);
  });
});

describe("renamedRouteRedirects", () => {
  it("permanently forwards the pre-rename /monitors URLs to /alerts", () => {
    expect(renamedRouteRedirects).toContainEqual({
      source: "/project/:projectId/monitors/:path*",
      destination: "/project/:projectId/alerts/:path*",
      permanent: true,
    });
  });
});
