import { describe, it, expect } from "vitest";

import {
  MonitorAlertSchema,
  MonitorNoDataModeSchema,
  MonitorNoDataSchema,
  MonitorRenotifySchema,
  MonitorSchema,
  MonitorSeveritySchema,
  MonitorStatusSchema,
  MonitorThresholdOperatorSchema,
  MonitorWindowSchema,
} from "./types";

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
  thresholdOperator: MonitorThresholdOperatorSchema.enum.GT,
  alertThreshold: 100,
  warningThreshold: null,

  severity: MonitorSeveritySchema.enum.UNKNOWN,
  severityChangedAt: null,

  noData: { mode: MonitorNoDataModeSchema.enum.SHOW_NO_DATA },
  renotify: { mode: "OFF" as const },

  status: MonitorStatusSchema.enum.ACTIVE,
  nextRunAt: new Date("2026-05-18T00:01:00.000Z"),
  lastPublishedAt: null,
  lastClaimedAt: null,
  lastCompletedAt: null,

  name: "High error rate",
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
  it.each([
    MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO,
    MonitorNoDataModeSchema.enum.LAST_SEVERITY,
    MonitorNoDataModeSchema.enum.SHOW_NO_DATA,
  ])("accepts the %s variant", (mode) => {
    expect(MonitorNoDataSchema.safeParse({ mode }).success).toBe(true);
  });

  it("accepts the NOTIFY_NO_DATA variant with a valid interval", () => {
    const result = MonitorNoDataSchema.safeParse({
      mode: MonitorNoDataModeSchema.enum.NOTIFY_NO_DATA,
      intervalMinutes: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects NOTIFY_NO_DATA without intervalMinutes", () => {
    expect(
      MonitorNoDataSchema.safeParse({
        mode: MonitorNoDataModeSchema.enum.NOTIFY_NO_DATA,
      }).success,
    ).toBe(false);
  });

  it("rejects the legacy SILENT variant", () => {
    expect(MonitorNoDataSchema.safeParse({ mode: "SILENT" }).success).toBe(
      false,
    );
  });

  it("rejects intervalMinutes below 1", () => {
    expect(
      MonitorNoDataSchema.safeParse({
        mode: MonitorNoDataModeSchema.enum.NOTIFY_NO_DATA,
        intervalMinutes: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects intervalMinutes above one day", () => {
    expect(
      MonitorNoDataSchema.safeParse({
        mode: MonitorNoDataModeSchema.enum.NOTIFY_NO_DATA,
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

describe("MonitorSchema", () => {
  it("parses a minimally valid Monitor", () => {
    const result = MonitorSchema.safeParse(validMonitorBase);
    expect(result.success).toBe(true);
  });
});

describe("MonitorSchema.triggerIds", () => {
  it("defaults to [] when omitted", () => {
    const result = MonitorSchema.safeParse(validMonitorBase);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.triggerIds).toEqual([]);
  });

  it("accepts a list of trigger IDs", () => {
    const result = MonitorSchema.safeParse({
      ...validMonitorBase,
      triggerIds: ["trig-a", "trig-b"],
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.triggerIds).toEqual(["trig-a", "trig-b"]);
  });
});

describe("MonitorAlertSchema", () => {
  const validAlert = {
    monitorId: "mon_01",
    projectId: "proj_01",
    severity: MonitorSeveritySchema.enum.ALERT,
    permalink: "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
    timestamp: new Date("2026-05-18T12:01:00.000Z"),
    fromTimestamp: new Date("2026-05-18T11:55:30.000Z"),
    toTimestamp: new Date("2026-05-18T12:00:30.000Z"),
    message: { title: "High error rate", body: "errors > 100" },
    view: "observations" as const,
    filters: [],
    window: "5m" as const,
  };

  it("parses a representative alert", () => {
    expect(MonitorAlertSchema.safeParse(validAlert).success).toBe(true);
  });

  it("accepts an omitted permalink (self-hosted without NEXTAUTH_URL)", () => {
    const { permalink: _permalink, ...withoutPermalink } = validAlert;
    expect(MonitorAlertSchema.safeParse(withoutPermalink).success).toBe(true);
  });

  it("round-trips an optional dataPermalink", () => {
    const withDataPermalink = {
      ...validAlert,
      dataPermalink:
        "https://cloud.langfuse.com/project/proj_01/traces?dateRange=1779450930000-1779451230000",
    };
    const result = MonitorAlertSchema.safeParse(withDataPermalink);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dataPermalink).toBe(withDataPermalink.dataPermalink);
    }
  });

  it("accepts an alert without dataPermalink (backward-compatible in-flight message)", () => {
    // validAlert already omits dataPermalink.
    expect(MonitorAlertSchema.safeParse(validAlert).success).toBe(true);
  });

  it("rejects a relative (path-only) dataPermalink", () => {
    expect(
      MonitorAlertSchema.safeParse({
        ...validAlert,
        dataPermalink: "/project/proj_01/traces?dateRange=1-2",
      }).success,
    ).toBe(false);
  });

  it("rejects a relative (path-only) permalink", () => {
    expect(
      MonitorAlertSchema.safeParse({
        ...validAlert,
        permalink: "/project/proj_01/monitors/mon_01",
      }).success,
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

  it("rejects an alert missing fromTimestamp", () => {
    const { fromTimestamp: _unused, ...withoutFrom } = validAlert;
    expect(MonitorAlertSchema.safeParse(withoutFrom).success).toBe(false);
  });

  it("rejects an alert missing toTimestamp", () => {
    const { toTimestamp: _unused, ...withoutTo } = validAlert;
    expect(MonitorAlertSchema.safeParse(withoutTo).success).toBe(false);
  });

  it("coerces fromTimestamp/toTimestamp strings to Dates", () => {
    const result = MonitorAlertSchema.safeParse({
      ...validAlert,
      fromTimestamp: "2026-05-18T11:55:30.000Z",
      toTimestamp: "2026-05-18T12:00:30.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fromTimestamp).toBeInstanceOf(Date);
      expect(result.data.toTimestamp).toBeInstanceOf(Date);
    }
  });
});
