import { describe, it, expect } from "vitest";

import {
  CreateMonitorSchema,
  ListMonitorsSchema,
  UpdateMonitorSchema,
} from "./types";

// Minimal valid `CreateMonitorSchema` payload. Tests override one field
// at a time to exercise the refinements wired onto the input schema.
const validCreateInput = {
  projectId: "proj_01",

  view: "observations" as const,
  filters: [],
  metric: { measure: "count", aggregation: "count" as const },

  window: "5m" as const,
  thresholdOperator: "GT" as const,
  alertThreshold: 100,
  warningThreshold: null,
  noData: { mode: "SILENT" as const },
  renotify: { mode: "OFF" as const },
  status: "ACTIVE" as const,

  name: "High error rate",
  tags: [],
};

const validUpdateInput = {
  ...validCreateInput,
  id: "mon_01",
};

describe("CreateMonitorSchema", () => {
  it("parses a minimal valid input", () => {
    expect(CreateMonitorSchema.safeParse(validCreateInput).success).toBe(true);
  });

  it("rejects warning >= alert for gt (validateThresholdOrder is wired)", () => {
    const result = CreateMonitorSchema.safeParse({
      ...validCreateInput,
      thresholdOperator: "GT" as const,
      alertThreshold: 100,
      warningThreshold: 100,
    });
    expect(result.success).toBe(false);
  });

  it.each(["GT", "GTE"] as const)(
    "%s emits a `>` strict-ordering message (not the operator name)",
    (op) => {
      const result = CreateMonitorSchema.safeParse({
        ...validCreateInput,
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 100,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues[0].message;
        expect(message).toContain(">");
        // Must NOT interpolate the operator literal — `gte` would otherwise
        // produce the misleading "must be gte" (non-strict) phrasing.
        expect(message).not.toContain(op);
      }
    },
  );

  it.each(["LT", "LTE"] as const)(
    "%s emits a `<` strict-ordering message (not the operator name)",
    (op) => {
      const result = CreateMonitorSchema.safeParse({
        ...validCreateInput,
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 100,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues[0].message;
        expect(message).toContain("<");
        expect(message).not.toContain(op);
      }
    },
  );

  it("rejects an unknown measure (validateQuery is wired)", () => {
    const result = CreateMonitorSchema.safeParse({
      ...validCreateInput,
      metric: { measure: "bogus_measure", aggregation: "count" as const },
    });
    expect(result.success).toBe(false);
  });

  it("rejects status `error-bad-query` on create (scheduler-owned)", () => {
    const result = CreateMonitorSchema.safeParse({
      ...validCreateInput,
      status: "ERROR_BAD_QUERY",
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateMonitorSchema", () => {
  it("parses a minimal valid input", () => {
    expect(UpdateMonitorSchema.safeParse(validUpdateInput).success).toBe(true);
  });

  it("rejects warning <= alert for lt (validateThresholdOrder is wired)", () => {
    const result = UpdateMonitorSchema.safeParse({
      ...validUpdateInput,
      thresholdOperator: "LT" as const,
      alertThreshold: 100,
      warningThreshold: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown filter column (validateQuery is wired)", () => {
    const result = UpdateMonitorSchema.safeParse({
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

  it("rejects status `error-bad-query` on update (scheduler-owned)", () => {
    // `error-bad-query` is flipped by the scheduler when a monitor's query
    // fails to evaluate. Callers must not be able to set or clear it
    // directly — narrowing the input DTO to active/paused enforces that.
    const result = UpdateMonitorSchema.safeParse({
      ...validUpdateInput,
      status: "ERROR_BAD_QUERY",
    });
    expect(result.success).toBe(false);
  });
});

describe("ListMonitorsSchema", () => {
  it("parses a minimal input with defaults filled in", () => {
    const result = ListMonitorsSchema.safeParse({
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
    const result = ListMonitorsSchema.safeParse({
      projectId: "proj_01",
      orderBy: { column: "name", order: "ASC" },
      page: 2,
      limit: 25,
    });
    expect(result.success).toBe(true);
  });

  it.each([
    "name",
    "status",
    "severity",
    "severityChangedAt",
    "alertedAt",
    "createdAt",
    "updatedAt",
  ] as const)("accepts %s as orderBy.column", (column) => {
    const result = ListMonitorsSchema.safeParse({
      projectId: "proj_01",
      orderBy: { column, order: "DESC" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown orderBy.column (Prisma would otherwise raise a 500)", () => {
    const result = ListMonitorsSchema.safeParse({
      projectId: "proj_01",
      orderBy: { column: "bogus", order: "DESC" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing projectId", () => {
    const result = ListMonitorsSchema.safeParse({ orderBy: null });
    expect(result.success).toBe(false);
  });
});
