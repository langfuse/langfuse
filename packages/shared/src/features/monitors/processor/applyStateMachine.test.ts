import { describe, it, expect } from "vitest";

import { applyStateMachine } from "./applyStateMachine";
import type { ComputedSeverity } from "./computeSeverity";
import type {
  Monitor,
  MonitorNoData,
  MonitorRenotify,
  MonitorSeverity,
} from "../types";

/** StateMachineCase is one applyStateMachine transition-table row. */
type StateMachineCase = {
  name: string;
  input: {
    prevSeverity: MonitorSeverity;
    computedSeverity: ComputedSeverity;
    prevSeverityChangedAt: Date | null;
    prevAlertedAt: Date | null;
    now: Date;
    noData: MonitorNoData;
    renotify: MonitorRenotify;
  };
  expected: {
    emit: boolean;
    nextSeverity: MonitorSeverity;
    nextSeverityChangedAt: Date | null;
    nextAlertedAt: Date | null;
  };
};

const t0 = new Date("2026-05-27T12:00:00.000Z");
const tMinus2m = new Date("2026-05-27T11:58:00.000Z");
const tMinus10m = new Date("2026-05-27T11:50:00.000Z");
const noDataSilent: MonitorNoData = { mode: "SILENT" };
const noDataNotify5: MonitorNoData = { mode: "NOTIFY", intervalMinutes: 5 };
const renotifyOff: MonitorRenotify = { mode: "OFF" };
const renotifyEvery5: MonitorRenotify = { mode: "EVERY", intervalMinutes: 5 };

/** baseMonitor supplies the Monitor fields applyStateMachine ignores. */
const baseMonitor: Monitor = {
  id: "m_test",
  createdAt: t0,
  updatedAt: t0,
  createdBy: null,
  updatedBy: null,
  projectId: "p_test",
  view: "observations",
  filters: [],
  metric: { measure: "count", aggregation: "count" },
  window: "5m",
  thresholdOperator: "GT",
  alertThreshold: 100,
  warningThreshold: null,
  noData: { mode: "SILENT" },
  renotify: { mode: "OFF" },
  name: "Test",
  tags: [],
  triggerIds: [],
  severity: "UNKNOWN",
  severityChangedAt: null,
  alertedAt: null,
  status: "ACTIVE",
  nextRunAt: null,
  lastPublishedAt: null,
  lastClaimedAt: null,
  lastCompletedAt: null,
};

/** cases enumerates the applyStateMachine transition table. */
const cases: StateMachineCase[] = [
  // === Cold-start (prev = UNKNOWN) ===
  {
    name: "UNKNOWN -> OK: silent",
    input: {
      prevSeverity: "UNKNOWN",
      computedSeverity: "OK",
      prevSeverityChangedAt: null,
      prevAlertedAt: null,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: false,
      nextSeverity: "OK",
      nextSeverityChangedAt: t0,
      nextAlertedAt: null,
    },
  },
  {
    name: "UNKNOWN -> WARNING: emit",
    input: {
      prevSeverity: "UNKNOWN",
      computedSeverity: "WARNING",
      prevSeverityChangedAt: null,
      prevAlertedAt: null,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "WARNING",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },
  {
    name: "UNKNOWN -> ALERT: emit",
    input: {
      prevSeverity: "UNKNOWN",
      computedSeverity: "ALERT",
      prevSeverityChangedAt: null,
      prevAlertedAt: null,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "ALERT",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },
  {
    name: "UNKNOWN -> NO_DATA: silent regardless of noData mode",
    input: {
      prevSeverity: "UNKNOWN",
      computedSeverity: "NO_DATA",
      prevSeverityChangedAt: null,
      prevAlertedAt: null,
      now: t0,
      noData: noDataNotify5,
      renotify: renotifyOff,
    },
    expected: {
      emit: false,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: t0,
      nextAlertedAt: null,
    },
  },

  // === NO_DATA -> OK (recovery) ===
  {
    name: "NO_DATA -> OK with noData SILENT: silent",
    input: {
      prevSeverity: "NO_DATA",
      computedSeverity: "OK",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: null,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: false,
      nextSeverity: "OK",
      nextSeverityChangedAt: t0,
      nextAlertedAt: null,
    },
  },
  {
    name: "NO_DATA -> OK with noData NOTIFY: emit",
    input: {
      prevSeverity: "NO_DATA",
      computedSeverity: "OK",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataNotify5,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "OK",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },

  // === NO_DATA -> WARNING / ALERT ===
  {
    name: "NO_DATA -> WARNING with noData SILENT: emit",
    input: {
      prevSeverity: "NO_DATA",
      computedSeverity: "WARNING",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: null,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "WARNING",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },
  {
    name: "NO_DATA -> ALERT: emit",
    input: {
      prevSeverity: "NO_DATA",
      computedSeverity: "ALERT",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: null,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "ALERT",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },

  // === OK / WARN / ALERT -> NO_DATA ===
  {
    name: "OK -> NO_DATA with noData SILENT: silent",
    input: {
      prevSeverity: "OK",
      computedSeverity: "NO_DATA",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: false,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: t0,
      nextAlertedAt: tMinus10m,
    },
  },
  {
    name: "OK -> NO_DATA with noData NOTIFY and prevAlertedAt past interval: emit",
    input: {
      prevSeverity: "OK",
      computedSeverity: "NO_DATA",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m, // interval 5m elapsed
      now: t0,
      noData: noDataNotify5,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },
  {
    name: "OK -> NO_DATA with noData NOTIFY and prevAlertedAt within interval: silent (cooldown)",
    input: {
      prevSeverity: "OK",
      computedSeverity: "NO_DATA",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus2m, // interval 5m not elapsed
      now: t0,
      noData: noDataNotify5,
      renotify: renotifyOff,
    },
    expected: {
      emit: false,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: t0,
      nextAlertedAt: tMinus2m,
    },
  },
  {
    name: "OK -> NO_DATA with noData NOTIFY and prevAlertedAt NULL: emit",
    input: {
      prevSeverity: "OK",
      computedSeverity: "NO_DATA",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: null,
      now: t0,
      noData: noDataNotify5,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },
  {
    name: "WARNING -> NO_DATA with noData NOTIFY past interval: emit",
    input: {
      prevSeverity: "WARNING",
      computedSeverity: "NO_DATA",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataNotify5,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },
  {
    name: "ALERT -> NO_DATA with noData SILENT: silent",
    input: {
      prevSeverity: "ALERT",
      computedSeverity: "NO_DATA",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: false,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: t0,
      nextAlertedAt: tMinus10m,
    },
  },

  // === OK -> WARNING / ALERT ===
  {
    name: "OK -> WARNING: emit",
    input: {
      prevSeverity: "OK",
      computedSeverity: "WARNING",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: null,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "WARNING",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },
  {
    name: "OK -> ALERT: emit",
    input: {
      prevSeverity: "OK",
      computedSeverity: "ALERT",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: null,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "ALERT",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },

  // === WARNING <-> ALERT ===
  {
    name: "WARNING -> ALERT: emit",
    input: {
      prevSeverity: "WARNING",
      computedSeverity: "ALERT",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "ALERT",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },
  {
    name: "ALERT -> WARNING: emit",
    input: {
      prevSeverity: "ALERT",
      computedSeverity: "WARNING",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "WARNING",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },

  // === WARNING / ALERT -> OK ===
  {
    name: "WARNING -> OK: emit",
    input: {
      prevSeverity: "WARNING",
      computedSeverity: "OK",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "OK",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },
  {
    name: "ALERT -> OK: emit",
    input: {
      prevSeverity: "ALERT",
      computedSeverity: "OK",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: true,
      nextSeverity: "OK",
      nextSeverityChangedAt: t0,
      nextAlertedAt: t0,
    },
  },

  // === OK -> OK ===
  {
    name: "OK -> OK: silent",
    input: {
      prevSeverity: "OK",
      computedSeverity: "OK",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyEvery5,
    },
    expected: {
      emit: false,
      nextSeverity: "OK",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: tMinus10m,
    },
  },

  // === WARNING/ALERT/NO_DATA self-loops (renotify) ===
  {
    name: "WARNING -> WARNING with renotify OFF: silent",
    input: {
      prevSeverity: "WARNING",
      computedSeverity: "WARNING",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: false,
      nextSeverity: "WARNING",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: tMinus10m,
    },
  },
  {
    name: "WARNING -> WARNING with renotify EVERY past interval: emit",
    input: {
      prevSeverity: "WARNING",
      computedSeverity: "WARNING",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m, // interval 5m elapsed
      now: t0,
      noData: noDataSilent,
      renotify: renotifyEvery5,
    },
    expected: {
      emit: true,
      nextSeverity: "WARNING",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: t0,
    },
  },
  {
    name: "WARNING -> WARNING with renotify EVERY within interval: silent",
    input: {
      prevSeverity: "WARNING",
      computedSeverity: "WARNING",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus2m, // interval 5m not elapsed
      now: t0,
      noData: noDataSilent,
      renotify: renotifyEvery5,
    },
    expected: {
      emit: false,
      nextSeverity: "WARNING",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: tMinus2m,
    },
  },
  {
    name: "ALERT -> ALERT with renotify EVERY past interval: emit",
    input: {
      prevSeverity: "ALERT",
      computedSeverity: "ALERT",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyEvery5,
    },
    expected: {
      emit: true,
      nextSeverity: "ALERT",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: t0,
    },
  },
  {
    name: "NO_DATA -> NO_DATA with renotify OFF: silent",
    input: {
      prevSeverity: "NO_DATA",
      computedSeverity: "NO_DATA",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyOff,
    },
    expected: {
      emit: false,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: tMinus10m,
    },
  },
  {
    name: "NO_DATA -> NO_DATA with noData SILENT and renotify EVERY past interval: silent",
    input: {
      prevSeverity: "NO_DATA",
      computedSeverity: "NO_DATA",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyEvery5,
    },
    expected: {
      emit: false,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: tMinus10m,
    },
  },
  {
    name: "NO_DATA -> NO_DATA with noData NOTIFY and renotify EVERY past interval: emit",
    input: {
      prevSeverity: "NO_DATA",
      computedSeverity: "NO_DATA",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataNotify5,
      renotify: renotifyEvery5,
    },
    expected: {
      emit: true,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: t0,
    },
  },
  {
    name: "NO_DATA -> NO_DATA with noData NOTIFY and renotify EVERY within interval: silent",
    input: {
      prevSeverity: "NO_DATA",
      computedSeverity: "NO_DATA",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus2m,
      now: t0,
      noData: noDataNotify5,
      renotify: renotifyEvery5,
    },
    expected: {
      emit: false,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: tMinus2m,
    },
  },
  {
    name: "NO_DATA -> NO_DATA with noData NOTIFY and renotify OFF: silent",
    input: {
      prevSeverity: "NO_DATA",
      computedSeverity: "NO_DATA",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataNotify5,
      renotify: renotifyOff,
    },
    expected: {
      emit: false,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: tMinus10m,
    },
  },
  {
    name: "WARNING -> WARNING with renotify EVERY and prevAlertedAt NULL: silent",
    input: {
      prevSeverity: "WARNING",
      computedSeverity: "WARNING",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: null,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyEvery5,
    },
    expected: {
      emit: false,
      nextSeverity: "WARNING",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: null,
    },
  },
  // === PAUSED guard: user paused between publish and process ===
  {
    name: "PAUSED -> anything: no-op, preserve PAUSED + prev stamps",
    input: {
      prevSeverity: "PAUSED",
      computedSeverity: "ALERT",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataNotify5,
      renotify: renotifyEvery5,
    },
    expected: {
      emit: false,
      nextSeverity: "PAUSED",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: tMinus10m,
    },
  },
];

describe("applyStateMachine", () => {
  it.each(cases)("$name", ({ input, expected }) => {
    const result = applyStateMachine({
      prev: {
        ...baseMonitor,
        severity: input.prevSeverity,
        severityChangedAt: input.prevSeverityChangedAt,
        alertedAt: input.prevAlertedAt,
        noData: input.noData,
        renotify: input.renotify,
      },
      next: { severity: input.computedSeverity },
      now: input.now,
    });
    expect(result.emit).toBe(expected.emit);
    expect(result.completion.severity).toBe(expected.nextSeverity);
    expect(result.completion.severityChangedAt?.toISOString() ?? null).toBe(
      expected.nextSeverityChangedAt?.toISOString() ?? null,
    );
    expect(result.completion.alertedAt?.toISOString() ?? null).toBe(
      expected.nextAlertedAt?.toISOString() ?? null,
    );
  });

  it("ALERT -> OK -> NO_DATA -> NO_DATA with noData SILENT stays silent on the self-loop", () => {
    const tAlert = new Date("2026-05-27T11:40:00.000Z");
    const tOk = new Date("2026-05-27T11:50:00.000Z");
    const tNoData = new Date("2026-05-27T11:55:00.000Z");
    const tLoop = new Date("2026-05-27T12:05:00.000Z");
    const monitor: Monitor = {
      ...baseMonitor,
      noData: noDataSilent,
      renotify: renotifyEvery5,
      severity: "ALERT",
      severityChangedAt: tAlert,
      alertedAt: tAlert,
    };

    const recovery = applyStateMachine({
      prev: monitor,
      next: { severity: "OK" },
      now: tOk,
    });
    expect(recovery.emit).toBe(true);
    expect(recovery.completion.alertedAt).toEqual(tOk);

    const enterNoData = applyStateMachine({
      prev: { ...monitor, ...recovery.completion },
      next: { severity: "NO_DATA" },
      now: tNoData,
    });
    expect(enterNoData.emit).toBe(false);
    expect(enterNoData.completion.alertedAt).toEqual(tOk);

    const selfLoop = applyStateMachine({
      prev: { ...monitor, ...enterNoData.completion },
      next: { severity: "NO_DATA" },
      now: tLoop,
    });
    expect(selfLoop.emit).toBe(false);
  });
});
