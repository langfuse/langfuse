// @vitest-environment node

import {
  resolveDashboardListOrderBy,
  resolveWidgetListOrderBy,
} from "./resolveDashboardListOrderBy";

describe("resolveWidgetListOrderBy", () => {
  it("drops Display Mode so the widgets table does not send it to Prisma", () => {
    expect(
      resolveWidgetListOrderBy({ column: "displayMode", order: "DESC" }),
    ).toEqual({ column: "updatedAt", order: "DESC" });
  });

  it("drops a leaked traces startTime column", () => {
    expect(
      resolveWidgetListOrderBy({ column: "startTime", order: "ASC" }),
    ).toEqual({ column: "updatedAt", order: "ASC" });
  });

  it("keeps sortable DashboardWidget columns", () => {
    expect(
      resolveWidgetListOrderBy({ column: "chartType", order: "ASC" }),
    ).toEqual({ column: "chartType", order: "ASC" });
  });
});

describe("resolveDashboardListOrderBy", () => {
  it("drops a leaked traces startTime column", () => {
    expect(
      resolveDashboardListOrderBy({ column: "startTime", order: "DESC" }),
    ).toEqual({ column: "updatedAt", order: "DESC" });
  });
});
