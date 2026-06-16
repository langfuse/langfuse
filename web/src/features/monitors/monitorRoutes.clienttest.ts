import { describe, expect, it } from "vitest";

import EditMonitorPage from "@/src/features/monitors/pages/EditMonitorPage";

describe("monitors/<id> route", () => {
  it("index route renders the same component as the edit route", async () => {
    const indexRoute =
      await import("@/src/pages/project/[projectId]/monitors/[monitorId]/index");
    const editRoute =
      await import("@/src/pages/project/[projectId]/monitors/[monitorId]/edit");

    expect(indexRoute.default).toBe(EditMonitorPage);
    expect(indexRoute.default).toBe(editRoute.default);
  });
});
