import { describe, it, expect } from "vitest";

import { applyStateMachine } from "./applyStateMachine";
import type { ComputedSeverity } from "./computeSeverity";
import type { MonitorNoData, MonitorRenotify, MonitorSeverity } from "../types";

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
const tMinus2m = new Date("2026-05-27T11:58:00.000Z"); // 2m before t0
const tMinus10m = new Date("2026-05-27T11:50:00.000Z"); // 10m before t0
const noDataSilent: MonitorNoData = { mode: "SILENT" };
const noDataNotify5: MonitorNoData = { mode: "NOTIFY", intervalMinutes: 5 };
const renotifyOff: MonitorRenotify = { mode: "OFF" };
const renotifyEvery5: MonitorRenotify = { mode: "EVERY", intervalMinutes: 5 };

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
    name: "UNKNOWN -> WARNING: emit (cold-start unhealthy)",
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
    name: "UNKNOWN -> ALERT: emit (cold-start unhealthy)",
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

  // === NO_DATA -> WARNING / ALERT (always surface non-OK) ===
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

  // === OK / WARN / ALERT -> NO_DATA (escalation to NO_DATA) ===
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
      prevAlertedAt: tMinus10m, // 10m ago, interval is 5m -> cooldown elapsed
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
      prevAlertedAt: tMinus2m, // 2m ago, interval is 5m -> still cooling down
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
    name: "OK -> NO_DATA with noData NOTIFY and prevAlertedAt NULL: emit (no prior emit)",
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

  // === OK -> WARNING / ALERT (always surface non-OK) ===
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

  // === WARNING <-> ALERT (escalation / de-escalation) ===
  {
    name: "WARNING -> ALERT: emit (escalation)",
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
    name: "ALERT -> WARNING: emit (de-escalation)",
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

  // === WARNING / ALERT -> OK (recovery) ===
  {
    name: "WARNING -> OK: emit (recovery)",
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
    name: "ALERT -> OK: emit (recovery)",
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

  // === OK -> OK (healthy steady state) ===
  {
    name: "OK -> OK: silent",
    input: {
      prevSeverity: "OK",
      computedSeverity: "OK",
      prevSeverityChangedAt: tMinus10m,
      prevAlertedAt: tMinus10m,
      now: t0,
      noData: noDataSilent,
      renotify: renotifyEvery5, // OK self-loops are silent even with renotify
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
      prevAlertedAt: tMinus10m, // 10m ago, interval 5m -> elapsed
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
      prevAlertedAt: tMinus2m, // 2m ago, interval 5m -> still cooling down
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
    name: "NO_DATA -> NO_DATA with renotify EVERY past interval: emit",
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
      emit: true,
      nextSeverity: "NO_DATA",
      nextSeverityChangedAt: tMinus10m,
      nextAlertedAt: t0,
    },
  },
  {
    name: "WARNING -> WARNING with renotify EVERY and prevAlertedAt NULL: silent (no base)",
    input: {
      // prev=WARNING with NULL alertedAt shouldn't happen in practice (the
      // transition into WARNING would have emitted) but guard against it.
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
];

describe("applyStateMachine", () => {
  it.each(cases)("$name", ({ input, expected }) => {
    const result = applyStateMachine(input);
    expect(result.emit).toBe(expected.emit);
    expect(result.nextSeverity).toBe(expected.nextSeverity);
    expect(result.nextSeverityChangedAt?.toISOString() ?? null).toBe(
      expected.nextSeverityChangedAt?.toISOString() ?? null,
    );
    expect(result.nextAlertedAt?.toISOString() ?? null).toBe(
      expected.nextAlertedAt?.toISOString() ?? null,
    );
  });
});
