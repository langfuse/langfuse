import { describe, it, expect } from "vitest";

import { DAY, HOUR, MINUTE, WEEK } from "./internal";
import {
  MonitorWindow,
  isValidMonitorWindow,
  calculateMonitorWindowCadenceMillis,
  MonitorRenotifySchema,
  MonitorNoDataSchema,
  MonitorSchema,
  MonitorQueueEventSchema,
  MonitorAlertSchema,
  MonitorWebhookQueueEventSchema,
  validateWarningAlertOrdering,
} from "./types";

// Minimal valid domain object. Tests override one field at a time.
const validMonitorBase = {
  id: "mon_01",
  createdAt: new Date("2026-05-18T00:00:00.000Z"),
  updatedAt: new Date("2026-05-18T00:00:00.000Z"),
  createdBy: null,
  updatedBy: null,
  projectId: "proj_01",

  view: "OBSERVATIONS" as const,
  filters: [],
  metric: { measure: "count", aggregation: "count" as const },

  window: MonitorWindow.FIVE_MIN,
  thresholdOperator: "GT" as const,
  alertThreshold: 100,
  warningThreshold: null,

  severity: "UNKNOWN" as const,
  severityChangedAt: null,

  noData: { mode: "SILENT" as const },
  renotify: { mode: "OFF" as const },

  status: "ACTIVE" as const,
  nextRunAt: new Date("2026-05-18T00:01:00.000Z"),
  lastPublishedRunAt: null,
  lastCompletedRunAt: null,

  name: "High error rate",
  message: "",
  tags: [],
  alertedAt: null,
};

describe("MonitorWindow tier map", () => {
  it("exposes the 10 RFC tiers with BigInt millisecond values", () => {
    expect(MonitorWindow.FIVE_MIN).toBe(5n * 60_000n);
    expect(MonitorWindow.TEN_MIN).toBe(10n * 60_000n);
    expect(MonitorWindow.FIFTEEN_MIN).toBe(15n * 60_000n);
    expect(MonitorWindow.THIRTY_MIN).toBe(30n * 60_000n);
    expect(MonitorWindow.ONE_HOUR).toBe(60n * 60_000n);
    expect(MonitorWindow.TWO_HOUR).toBe(2n * 60n * 60_000n);
    expect(MonitorWindow.FOUR_HOUR).toBe(4n * 60n * 60_000n);
    expect(MonitorWindow.ONE_DAY).toBe(24n * 60n * 60_000n);
    expect(MonitorWindow.TWO_DAY).toBe(2n * 24n * 60n * 60_000n);
    expect(MonitorWindow.ONE_WEEK).toBe(7n * 24n * 60n * 60_000n);
  });
});

describe("isValidMonitorWindow", () => {
  it("accepts every MonitorWindow tier value", () => {
    for (const tier of Object.values(MonitorWindow)) {
      expect(isValidMonitorWindow(tier)).toBe(true);
    }
  });

  it("rejects a bigint that isn't a known tier", () => {
    expect(isValidMonitorWindow(123n)).toBe(false);
  });
});

describe("calculateMonitorWindowCadenceMillis", () => {
  it("returns 1 minute for sub-day windows", () => {
    expect(calculateMonitorWindowCadenceMillis(MonitorWindow.FIVE_MIN)).toBe(
      MINUTE,
    );
    expect(calculateMonitorWindowCadenceMillis(MonitorWindow.FOUR_HOUR)).toBe(
      MINUTE,
    );
    expect(calculateMonitorWindowCadenceMillis(DAY - 1n)).toBe(MINUTE);
  });

  it("returns 30 minutes for day-to-week windows", () => {
    expect(calculateMonitorWindowCadenceMillis(MonitorWindow.ONE_DAY)).toBe(
      30n * MINUTE,
    );
    expect(calculateMonitorWindowCadenceMillis(DAY + 1n)).toBe(30n * MINUTE);
    expect(calculateMonitorWindowCadenceMillis(MonitorWindow.TWO_DAY)).toBe(
      30n * MINUTE,
    );
    expect(calculateMonitorWindowCadenceMillis(WEEK - 1n)).toBe(30n * MINUTE);
  });

  it("returns 48 hours for week-and-up windows", () => {
    expect(calculateMonitorWindowCadenceMillis(MonitorWindow.ONE_WEEK)).toBe(
      48n * HOUR,
    );
    expect(calculateMonitorWindowCadenceMillis(WEEK + 1n)).toBe(48n * HOUR);
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

describe("validateWarningAlertOrdering", () => {
  it.each(["GT", "GTE"] as const)("%s requires warning < alert", (op) => {
    expect(
      validateWarningAlertOrdering({
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 50,
      }),
    ).toBe(true);
    expect(
      validateWarningAlertOrdering({
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 100,
      }),
    ).toBe(false);
  });

  it.each(["LT", "LTE"] as const)("%s requires warning > alert", (op) => {
    expect(
      validateWarningAlertOrdering({
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 200,
      }),
    ).toBe(true);
    expect(
      validateWarningAlertOrdering({
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 100,
      }),
    ).toBe(false);
  });

  it.each(["EQ", "NEQ"] as const)(
    "%s always passes regardless of ordering",
    (op) => {
      for (const warning of [50, 100, 200]) {
        expect(
          validateWarningAlertOrdering({
            thresholdOperator: op,
            alertThreshold: 100,
            warningThreshold: warning,
          }),
        ).toBe(true);
      }
    },
  );

  it.each(["GT", "GTE", "LT", "LTE", "EQ", "NEQ"] as const)(
    "%s passes with null warningThreshold",
    (op) => {
      expect(
        validateWarningAlertOrdering({
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: null,
        }),
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

  describe("warning/alert threshold ordering refinement", () => {
    it.each(["GT", "GTE"] as const)(
      "%s rejects warningThreshold >= alertThreshold",
      (op) => {
        const result = MonitorSchema.safeParse({
          ...validMonitorBase,
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: 100, // equal → must reject
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toEqual(["warningThreshold"]);
        }

        const tooHigh = MonitorSchema.safeParse({
          ...validMonitorBase,
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: 200,
        });
        expect(tooHigh.success).toBe(false);
      },
    );

    it.each(["GT", "GTE"] as const)(
      "%s accepts warningThreshold < alertThreshold",
      (op) => {
        expect(
          MonitorSchema.safeParse({
            ...validMonitorBase,
            thresholdOperator: op,
            alertThreshold: 100,
            warningThreshold: 50,
          }).success,
        ).toBe(true);
      },
    );

    it.each(["LT", "LTE"] as const)(
      "%s rejects warningThreshold <= alertThreshold",
      (op) => {
        const result = MonitorSchema.safeParse({
          ...validMonitorBase,
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: 100,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toEqual(["warningThreshold"]);
        }

        const tooLow = MonitorSchema.safeParse({
          ...validMonitorBase,
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: 50,
        });
        expect(tooLow.success).toBe(false);
      },
    );

    it.each(["LT", "LTE"] as const)(
      "%s accepts warningThreshold > alertThreshold",
      (op) => {
        expect(
          MonitorSchema.safeParse({
            ...validMonitorBase,
            thresholdOperator: op,
            alertThreshold: 100,
            warningThreshold: 200,
          }).success,
        ).toBe(true);
      },
    );

    it.each(["EQ", "NEQ"] as const)(
      "%s accepts any warningThreshold/alertThreshold ordering",
      (op) => {
        for (const warning of [50, 100, 200]) {
          expect(
            MonitorSchema.safeParse({
              ...validMonitorBase,
              thresholdOperator: op,
              alertThreshold: 100,
              warningThreshold: warning,
            }).success,
          ).toBe(true);
        }
      },
    );

    it.each(["GT", "GTE", "LT", "LTE", "EQ", "NEQ"] as const)(
      "%s accepts a null warningThreshold regardless of alertThreshold",
      (op) => {
        expect(
          MonitorSchema.safeParse({
            ...validMonitorBase,
            thresholdOperator: op,
            alertThreshold: 100,
            warningThreshold: null,
          }).success,
        ).toBe(true);
      },
    );
  });
});

describe("MonitorQueueEventSchema", () => {
  const validQueueEvent = {
    projectId: "proj_01",
    schedulerBatchId: 42n,
    scheduledAt: new Date("2026-05-18T12:00:00.000Z"),
    view: "OBSERVATIONS" as const,
    filters: [],
    window: MonitorWindow.FIVE_MIN,
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

  it("coerces a string window to a bigint", () => {
    const result = MonitorQueueEventSchema.safeParse({
      ...validQueueEvent,
      window: MonitorWindow.FIVE_MIN.toString(),
    });
    expect(result.success).toBe(true);
    if (result.success) expect(typeof result.data.window).toBe("bigint");
  });

  it("rejects a window outside the MonitorWindow tier set", () => {
    expect(
      MonitorQueueEventSchema.safeParse({
        ...validQueueEvent,
        window: 123n,
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
    severity: "ALERT" as const,
    permalink: "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
    timestamp: new Date("2026-05-18T12:01:00.000Z"),
    message: { title: "High error rate", body: "errors > 100" },
    view: "OBSERVATIONS" as const,
    filters: [],
    window: MonitorWindow.FIVE_MIN,
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
      MonitorAlertSchema.safeParse({ ...validAlert, window: 123n }).success,
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

  it("coerces a string window to a bigint", () => {
    const result = MonitorAlertSchema.safeParse({
      ...validAlert,
      window: MonitorWindow.FIVE_MIN.toString(),
    });
    expect(result.success).toBe(true);
    if (result.success) expect(typeof result.data.window).toBe("bigint");
  });
});

describe("MonitorWebhookQueueEventSchema", () => {
  const validEnvelope = {
    type: "monitor-alert" as const,
    version: "v1" as const,
    payload: {
      monitorId: "mon_01",
      projectId: "proj_01",
      severity: "ALERT" as const,
      permalink: "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
      timestamp: new Date("2026-05-18T12:01:00.000Z"),
      message: { title: "High error rate", body: "errors > 100" },
      view: "OBSERVATIONS" as const,
      filters: [],
      window: MonitorWindow.FIVE_MIN,
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
