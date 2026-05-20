import { describe, it, expect } from "vitest";
import { z } from "zod";

import { calculateCadence, DAY, HOUR, MINUTE, WEEK } from "./internal";
import {
  MonitorAlertSchema,
  MonitorNoDataSchema,
  MonitorQueueEventSchema,
  MonitorRenotifySchema,
  MonitorSchema,
  MonitorThresholdOperatorSchema,
  MonitorWebhookQueueEventSchema,
  MonitorWindowSchema,
  validateThresholdOrder,
} from "./types";

// Standalone wrapper around `validateThresholdOrder` so the refinement can be
// exercised directly. The refinement is wired into `CreateMonitorInputSchema`
// and `UpdateMonitorInputSchema` in MonitorService.ts; this isolates the rule.
const ThresholdOrderTestSchema = z
  .object({
    thresholdOperator: MonitorThresholdOperatorSchema,
    alertThreshold: z.number(),
    warningThreshold: z.number().nullable(),
  })
  .superRefine(validateThresholdOrder);

// Minimal valid domain object. Tests override one field at a time.
const validMonitorBase = {
  id: "mon_01",
  createdAt: new Date("2026-05-18T00:00:00.000Z"),
  updatedAt: new Date("2026-05-18T00:00:00.000Z"),
  createdBy: null,
  updatedBy: null,
  projectId: "proj_01",

  view: "observations" as const,
  filters: [],
  metric: { measure: "count", aggregation: "count" as const },

  window: "5m" as const,
  thresholdOperator: "gt" as const,
  alertThreshold: 100,
  warningThreshold: null,

  severity: "unknown" as const,
  severityChangedAt: null,

  noData: { mode: "SILENT" as const },
  renotify: { mode: "OFF" as const },

  status: "active" as const,
  nextRunAt: new Date("2026-05-18T00:01:00.000Z"),
  lastPublishedRunAt: null,
  lastCompletedRunAt: null,

  name: "High error rate",
  message: "",
  tags: [],
  alertedAt: null,
};

describe("MonitorWindowSchema", () => {
  it("accepts every MonitorWindow tier value", () => {
    for (const tier of MonitorWindowSchema.options) {
      expect(MonitorWindowSchema.safeParse(tier).success).toBe(true);
    }
  });

  it("rejects a value that isn't a known tier", () => {
    expect(MonitorWindowSchema.safeParse("bogus").success).toBe(false);
  });
});

describe("calculateCadence", () => {
  it("returns 1 minute for sub-day windows", () => {
    expect(calculateCadence(5n * 60_000n)).toBe(MINUTE);
    expect(calculateCadence(4n * 60n * 60_000n)).toBe(
      MINUTE,
    );
    expect(calculateCadence(DAY - 1n)).toBe(MINUTE);
  });

  it("returns 30 minutes for day-to-week windows", () => {
    expect(calculateCadence(24n * 60n * 60_000n)).toBe(
      30n * MINUTE,
    );
    expect(calculateCadence(DAY + 1n)).toBe(30n * MINUTE);
    expect(calculateCadence(2n * 24n * 60n * 60_000n)).toBe(
      30n * MINUTE,
    );
    expect(calculateCadence(WEEK - 1n)).toBe(30n * MINUTE);
  });

  it("returns 48 hours for week-and-up windows", () => {
    expect(calculateCadence(7n * 24n * 60n * 60_000n)).toBe(
      48n * HOUR,
    );
    expect(calculateCadence(WEEK + 1n)).toBe(48n * HOUR);
  });
});

describe("MonitorRenotifySchema", () => {
  it("accepts the OFF variant", () => {
    expect(MonitorRenotifySchema.safeParse({ mode: "OFF" }).success).toBe(true);
  });

  it("accepts the EVERY variant with a valid interval", () => {
    const result = MonitorRenotifySchema.safeParse({
      mode: "EVERY",
      intervalMinutes: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects EVERY without intervalMinutes", () => {
    expect(MonitorRenotifySchema.safeParse({ mode: "EVERY" }).success).toBe(
      false,
    );
  });

  it("rejects intervalMinutes below 1", () => {
    expect(
      MonitorRenotifySchema.safeParse({ mode: "EVERY", intervalMinutes: 0 })
        .success,
    ).toBe(false);
  });

  it("rejects intervalMinutes above one week", () => {
    expect(
      MonitorRenotifySchema.safeParse({
        mode: "EVERY",
        intervalMinutes: 60 * 24 * 7 + 1,
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown discriminator", () => {
    expect(
      MonitorRenotifySchema.safeParse({
        mode: "BOGUS",
        intervalMinutes: 5,
      }).success,
    ).toBe(false);
  });
});

describe("MonitorNoDataSchema", () => {
  it("accepts the SILENT variant", () => {
    expect(MonitorNoDataSchema.safeParse({ mode: "SILENT" }).success).toBe(
      true,
    );
  });

  it("accepts the NOTIFY variant with a valid interval", () => {
    const result = MonitorNoDataSchema.safeParse({
      mode: "NOTIFY",
      intervalMinutes: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects NOTIFY without intervalMinutes", () => {
    expect(MonitorNoDataSchema.safeParse({ mode: "NOTIFY" }).success).toBe(
      false,
    );
  });

  it("rejects intervalMinutes below 1", () => {
    expect(
      MonitorNoDataSchema.safeParse({ mode: "NOTIFY", intervalMinutes: 0 })
        .success,
    ).toBe(false);
  });

  it("rejects intervalMinutes above one day", () => {
    expect(
      MonitorNoDataSchema.safeParse({
        mode: "NOTIFY",
        intervalMinutes: 60 * 24 + 1,
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown discriminator", () => {
    expect(
      MonitorNoDataSchema.safeParse({
        mode: "BOGUS",
        intervalMinutes: 5,
      }).success,
    ).toBe(false);
  });
});

describe("validateThresholdOrder", () => {
  it.each(["gt", "gte"] as const)("%s requires warning < alert", (op) => {
    expect(
      ThresholdOrderTestSchema.safeParse({
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 50,
      }).success,
    ).toBe(true);
    expect(
      ThresholdOrderTestSchema.safeParse({
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 100,
      }).success,
    ).toBe(false);
  });

  it.each(["lt", "lte"] as const)("%s requires warning > alert", (op) => {
    expect(
      ThresholdOrderTestSchema.safeParse({
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 200,
      }).success,
    ).toBe(true);
    expect(
      ThresholdOrderTestSchema.safeParse({
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 100,
      }).success,
    ).toBe(false);
  });

  it.each(["eq", "neq"] as const)(
    "%s always passes regardless of ordering",
    (op) => {
      for (const warning of [50, 100, 200]) {
        expect(
          ThresholdOrderTestSchema.safeParse({
            thresholdOperator: op,
            alertThreshold: 100,
            warningThreshold: warning,
          }).success,
        ).toBe(true);
      }
    },
  );

  it.each(["gt", "gte", "lt", "lte", "eq", "neq"] as const)(
    "%s passes with null warningThreshold",
    (op) => {
      expect(
        ThresholdOrderTestSchema.safeParse({
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: null,
        }).success,
      ).toBe(true);
    },
  );
});

describe("MonitorSchema", () => {
  it("parses a minimally valid Monitor", () => {
    const result = MonitorSchema.safeParse(validMonitorBase);
    expect(result.success).toBe(true);
  });

  it("rejects a message longer than 2000 characters", () => {
    const result = MonitorSchema.safeParse({
      ...validMonitorBase,
      message: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a message with an invalid handlebars template", () => {
    const result = MonitorSchema.safeParse({
      ...validMonitorBase,
      message: "{{unknown}}",
    });
    expect(result.success).toBe(false);
  });
});

describe("MonitorQueueEventSchema", () => {
  const validQueueEvent = {
    projectId: "proj_01",
    schedulerBatchId: 42n,
    scheduledAt: new Date("2026-05-18T12:00:00.000Z"),
    view: "observations" as const,
    filters: [],
    window: "5m" as const,
    metrics: [{ measure: "count", aggregation: "count" as const }],
    monitors: [{ monitorId: "mon_01", metricName: "count_count" }],
  };

  it("parses a representative queue event", () => {
    const result = MonitorQueueEventSchema.safeParse(validQueueEvent);
    expect(result.success).toBe(true);
  });

  it("coerces a string scheduledAt to a Date", () => {
    const result = MonitorQueueEventSchema.safeParse({
      ...validQueueEvent,
      scheduledAt: "2026-05-18T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.scheduledAt).toBeInstanceOf(Date);
  });

  it("coerces a string schedulerBatchId to a bigint", () => {
    const result = MonitorQueueEventSchema.safeParse({
      ...validQueueEvent,
      schedulerBatchId: "42",
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(typeof result.data.schedulerBatchId).toBe("bigint");
  });

  it("rejects a window outside the MonitorWindow tier set", () => {
    expect(
      MonitorQueueEventSchema.safeParse({
        ...validQueueEvent,
        window: "bogus",
      }).success,
    ).toBe(false);
  });

  it("accepts an empty monitors array", () => {
    // Scheduler may publish with zero monitors if everything in the batch was
    // filtered out — schema should not block; downstream worker handles it.
    expect(
      MonitorQueueEventSchema.safeParse({ ...validQueueEvent, monitors: [] })
        .success,
    ).toBe(true);
  });
});

describe("MonitorAlertSchema", () => {
  const validAlert = {
    monitorId: "mon_01",
    projectId: "proj_01",
    severity: "alert" as const,
    permalink: "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
    timestamp: new Date("2026-05-18T12:01:00.000Z"),
    message: { title: "High error rate", body: "errors > 100" },
    view: "observations" as const,
    filters: [],
    window: "5m" as const,
  };

  it("parses a representative alert", () => {
    expect(MonitorAlertSchema.safeParse(validAlert).success).toBe(true);
  });

  it("rejects a non-URL permalink", () => {
    expect(
      MonitorAlertSchema.safeParse({ ...validAlert, permalink: "not-a-url" })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown severity", () => {
    expect(
      MonitorAlertSchema.safeParse({ ...validAlert, severity: "BOGUS" })
        .success,
    ).toBe(false);
  });

  it("rejects a window outside the MonitorWindow tier set", () => {
    expect(
      MonitorAlertSchema.safeParse({ ...validAlert, window: "bogus" }).success,
    ).toBe(false);
  });

  it("coerces a string timestamp to a Date", () => {
    const result = MonitorAlertSchema.safeParse({
      ...validAlert,
      timestamp: "2026-05-18T12:01:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.timestamp).toBeInstanceOf(Date);
  });
});

describe("MonitorWebhookQueueEventSchema", () => {
  const validEnvelope = {
    type: "monitor-alert" as const,
    version: "v1" as const,
    payload: {
      monitorId: "mon_01",
      projectId: "proj_01",
      severity: "alert" as const,
      permalink: "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
      timestamp: new Date("2026-05-18T12:01:00.000Z"),
      message: { title: "High error rate", body: "errors > 100" },
      view: "observations" as const,
      filters: [],
      window: "5m" as const,
    },
  };

  it("parses a valid envelope", () => {
    expect(
      MonitorWebhookQueueEventSchema.safeParse(validEnvelope).success,
    ).toBe(true);
  });

  it("rejects a wrong type discriminator", () => {
    expect(
      MonitorWebhookQueueEventSchema.safeParse({
        ...validEnvelope,
        type: "prompt-version",
      }).success,
    ).toBe(false);
  });

  it("rejects a wrong version literal", () => {
    expect(
      MonitorWebhookQueueEventSchema.safeParse({
        ...validEnvelope,
        version: "v2",
      }).success,
    ).toBe(false);
  });
});
