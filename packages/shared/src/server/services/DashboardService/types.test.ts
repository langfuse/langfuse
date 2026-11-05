import { describe, expect, it } from "vitest";
import { LANGFUSE_HOME_DASHBOARD } from "../../../domain/home-dashboard";
import { DashboardDefinitionSchema, DashboardDomainSchema } from "./types";

describe("persisted dashboard definitions", () => {
  it("omits future placement types only on reads, while validating known placements and all writes", () => {
    const known = LANGFUSE_HOME_DASHBOARD.definition.widgets[0];
    const future = {
      type: "future-placement",
      id: "future",
      payload: { version: 2 },
    };
    const definition = { widgets: [known, future] };
    const dashboard = {
      ...LANGFUSE_HOME_DASHBOARD,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: null,
      updatedBy: null,
      projectId: null,
      owner: "LANGFUSE",
      definition,
    };

    expect(DashboardDomainSchema.parse(dashboard).definition.widgets).toEqual([
      known,
    ]);
    expect(DashboardDefinitionSchema.safeParse(definition).success).toBe(false);

    for (const placement of [
      { ...known, x_size: -1 },
      { type: "widget", id: "broken" },
      { type: "" },
      { type: null },
      {},
      null,
    ]) {
      expect(
        DashboardDomainSchema.safeParse({
          ...dashboard,
          definition: { widgets: [placement] },
        }).success,
      ).toBe(false);
    }
  });
});
