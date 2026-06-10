import { describe, it, expect } from "vitest";

import {
  CreateMonitorSchema,
  ErrorListMonitorFilterDuplicateColumn,
  ListMonitorFilterSchema,
  ListMonitorsSchema,
  UpdateMonitorSchema,
} from "./types";
import {
  ErrorAlertThresholdRequired,
  ErrorAtLeastOneTrigger,
  ErrorNameRequired,
  MonitorNoDataModeSchema,
  MonitorSeveritySchema,
  MonitorStatusSchema,
  MonitorThresholdOperatorSchema,
} from "../types";

// Minimal valid `CreateMonitorSchema` payload. Tests override one field
// at a time to exercise the refinements wired onto the input schema.
const validCreateInput = {
  projectId: "proj_01",

  view: "observations" as const,
  filters: [],
  metric: { measure: "count", aggregation: "count" as const },

  window: "5m" as const,
  thresholdOperator: MonitorThresholdOperatorSchema.enum.GT,
  alertThreshold: 100,
  warningThreshold: null,
  noData: { mode: MonitorNoDataModeSchema.enum.SHOW_NO_DATA },
  renotify: { mode: "OFF" as const },
  status: MonitorStatusSchema.enum.ACTIVE,

  name: "High error rate",
  tags: [],
  triggerIds: ["trig_01"],
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
      thresholdOperator: MonitorThresholdOperatorSchema.enum.GT,
      alertThreshold: 100,
      warningThreshold: 100,
    });
    expect(result.success).toBe(false);
  });

  it.each([
    MonitorThresholdOperatorSchema.enum.GT,
    MonitorThresholdOperatorSchema.enum.GTE,
  ])("%s emits a `>` strict-ordering message (not the operator name)", (op) => {
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
  });

  it.each([
    MonitorThresholdOperatorSchema.enum.LT,
    MonitorThresholdOperatorSchema.enum.LTE,
  ])("%s emits a `<` strict-ordering message (not the operator name)", (op) => {
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
  });

  it("rejects an unknown measure (validateQuery is wired)", () => {
    const result = CreateMonitorSchema.safeParse({
      ...validCreateInput,
      metric: { measure: "bogus_measure", aggregation: "count" as const },
    });
    expect(result.success).toBe(false);
  });

  it("emits a friendly message when name is missing", () => {
    const { name: _name, ...rest } = validCreateInput;
    const result = CreateMonitorSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameIssue = result.error.issues.find(
        (i) => i.path.join(".") === "name",
      );
      expect(nameIssue?.message).toBe(ErrorNameRequired);
    }
  });

  it("emits a friendly message when alertThreshold is missing", () => {
    const { alertThreshold: _t, ...rest } = validCreateInput;
    const result = CreateMonitorSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join(".") === "alertThreshold",
      );
      expect(issue?.message).toBe(ErrorAlertThresholdRequired);
    }
  });

  it("rejects status `error-bad-query` on create (scheduler-owned)", () => {
    const result = CreateMonitorSchema.safeParse({
      ...validCreateInput,
      status: MonitorStatusSchema.enum.ERROR_BAD_QUERY,
    });
    expect(result.success).toBe(false);
  });

  describe("triggerIds", () => {
    it("rejects an empty list with ErrorAtLeastOneTrigger on path triggerIds", () => {
      const result = CreateMonitorSchema.safeParse({
        ...validCreateInput,
        triggerIds: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) => i.path.join(".") === "triggerIds",
        );
        expect(issue?.message).toBe(ErrorAtLeastOneTrigger);
      }
    });

    it("rejects an omitted list with ErrorAtLeastOneTrigger on path triggerIds", () => {
      const { triggerIds: _t, ...rest } = validCreateInput;
      const result = CreateMonitorSchema.safeParse(rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) => i.path.join(".") === "triggerIds",
        );
        expect(issue?.message).toBe(ErrorAtLeastOneTrigger);
      }
    });

    it("accepts a list of ids", () => {
      const result = CreateMonitorSchema.safeParse({
        ...validCreateInput,
        triggerIds: ["trig_01", "trig_02"],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.triggerIds).toEqual(["trig_01", "trig_02"]);
      }
    });
  });
});

describe("UpdateMonitorSchema", () => {
  it("parses a minimal valid input", () => {
    expect(UpdateMonitorSchema.safeParse(validUpdateInput).success).toBe(true);
  });

  it("rejects warning <= alert for lt (validateThresholdOrder is wired)", () => {
    const result = UpdateMonitorSchema.safeParse({
      ...validUpdateInput,
      thresholdOperator: MonitorThresholdOperatorSchema.enum.LT,
      alertThreshold: 100,
      warningThreshold: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a disallowed filter column (validateQuery is wired)", () => {
    const result = UpdateMonitorSchema.safeParse({
      ...validUpdateInput,
      filters: [
        {
          type: "string",
          column: "metadata",
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
      status: MonitorStatusSchema.enum.ERROR_BAD_QUERY,
    });
    expect(result.success).toBe(false);
  });

  it("leaves status undefined when omitted so a save can't change it", () => {
    const { status, ...withoutStatus } = validUpdateInput;
    const result = UpdateMonitorSchema.safeParse(withoutStatus);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBeUndefined();
    }
  });

  describe("triggerIds", () => {
    it("rejects an empty list with ErrorAtLeastOneTrigger on path triggerIds", () => {
      const result = UpdateMonitorSchema.safeParse({
        ...validUpdateInput,
        triggerIds: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) => i.path.join(".") === "triggerIds",
        );
        expect(issue?.message).toBe(ErrorAtLeastOneTrigger);
      }
    });

    it("rejects an omitted list with ErrorAtLeastOneTrigger on path triggerIds", () => {
      const { triggerIds: _t, ...rest } = validUpdateInput;
      const result = UpdateMonitorSchema.safeParse(rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) => i.path.join(".") === "triggerIds",
        );
        expect(issue?.message).toBe(ErrorAtLeastOneTrigger);
      }
    });

    it("accepts a list of ids", () => {
      const result = UpdateMonitorSchema.safeParse({
        ...validUpdateInput,
        triggerIds: ["trig_01", "trig_02"],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.triggerIds).toEqual(["trig_01", "trig_02"]);
      }
    });
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

describe("ListMonitorFilterSchema", () => {
  it("parses an empty filter", () => {
    expect(ListMonitorFilterSchema.safeParse([]).success).toBe(true);
  });

  it("parses one severity row and one tags row", () => {
    const result = ListMonitorFilterSchema.safeParse([
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: [MonitorSeveritySchema.enum.ALERT],
      },
      {
        type: "arrayOptions",
        column: "tags",
        operator: "any of",
        value: ["prod"],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects two rows on the same column with ErrorListMonitorFilterDuplicateColumn", () => {
    const result = ListMonitorFilterSchema.safeParse([
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: [MonitorSeveritySchema.enum.ALERT],
      },
      {
        type: "stringOptions",
        column: "severity",
        operator: "none of",
        value: [MonitorSeveritySchema.enum.PAUSED],
      },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        ErrorListMonitorFilterDuplicateColumn,
      );
    }
  });
});
