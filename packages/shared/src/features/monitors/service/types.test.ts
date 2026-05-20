import { describe, it, expect } from "vitest";

import {
  CreateMonitorInputSchema,
  MonitorListInputSchema,
  UpdateMonitorInputSchema,
} from "./types";

// Minimal valid `CreateMonitorInputSchema` payload. Tests override one field
// at a time to exercise the refinements wired onto the input schema.
const validCreateInput = {
  projectId: "proj_01",
  createdBy: null,

  view: "observations" as const,
  filters: [],
  metric: { measure: "count", aggregation: "count" as const },

  window: "5m" as const,
  thresholdOperator: "gt" as const,
  alertThreshold: 100,
  warningThreshold: null,
  noData: { mode: "SILENT" as const },
  renotify: { mode: "OFF" as const },
  status: "active" as const,

  name: "High error rate",
  message: "",
  tags: [],
};

const validUpdateInput = {
  ...validCreateInput,
  id: "mon_01",
  updatedBy: null,
};

describe("CreateMonitorInputSchema", () => {
  it("parses a minimal valid input", () => {
    expect(CreateMonitorInputSchema.safeParse(validCreateInput).success).toBe(
      true,
    );
  });

  it("rejects warning >= alert for gt (validateThresholdOrder is wired)", () => {
    const result = CreateMonitorInputSchema.safeParse({
      ...validCreateInput,
      thresholdOperator: "gt" as const,
      alertThreshold: 100,
      warningThreshold: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown measure (validateQuery is wired)", () => {
    const result = CreateMonitorInputSchema.safeParse({
      ...validCreateInput,
      metric: { measure: "bogus_measure", aggregation: "count" as const },
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateMonitorInputSchema", () => {
  it("parses a minimal valid input", () => {
    expect(UpdateMonitorInputSchema.safeParse(validUpdateInput).success).toBe(
      true,
    );
  });

  it("rejects warning <= alert for lt (validateThresholdOrder is wired)", () => {
    const result = UpdateMonitorInputSchema.safeParse({
      ...validUpdateInput,
      thresholdOperator: "lt" as const,
      alertThreshold: 100,
      warningThreshold: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown filter column (validateQuery is wired)", () => {
    const result = UpdateMonitorInputSchema.safeParse({
      ...validUpdateInput,
      filters: [
        {
          type: "string",
          column: "not_a_dimension",
          operator: "=",
          value: "x",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("MonitorListInputSchema", () => {
  it("parses a minimal input with defaults filled in", () => {
    const result = MonitorListInputSchema.safeParse({
      projectId: "proj_01",
      orderBy: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
    }
  });

  it("accepts an orderBy + explicit pagination", () => {
    const result = MonitorListInputSchema.safeParse({
      projectId: "proj_01",
      orderBy: { column: "name", order: "ASC" },
      page: 2,
      limit: 25,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing projectId", () => {
    const result = MonitorListInputSchema.safeParse({ orderBy: null });
    expect(result.success).toBe(false);
  });
});
