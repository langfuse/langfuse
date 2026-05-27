import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  MonitorProcessor,
  type MonitorCompletion,
} from "@langfuse/shared/monitors/server";
import { prisma } from "@langfuse/shared/src/db";
import type { Prisma } from "@prisma/client";
import type { MonitorSeverity } from "@prisma/client";

type SeedOverrides = Partial<{
  id: string;
  severity: MonitorSeverity;
  severityChangedAt: Date | null;
  alertedAt: Date | null;
  lastCompletedAt: Date | null;
}>;

type MonitorSeed = { id: string } & SeedOverrides;

type ExpectedRow = {
  id: string;
  severity: MonitorSeverity;
  severityChangedAt: Date | null;
  alertedAt: Date | null;
  lastCompletedAt: Date | null;
};

type CompleteCase = {
  name: string;
  monitors: MonitorSeed[];
  completions: (Omit<MonitorCompletion, "monitorId"> & { monitorId: string })[];
  expect: { rows: ExpectedRow[] };
};

const oneMinuteMs = 60n * 1000n;

const t0 = new Date("2026-05-27T12:00:00.000Z");
const tMinus10m = new Date("2026-05-27T11:50:00.000Z");

async function seedMonitor(projectId: string, seed: MonitorSeed) {
  return prisma.monitor.create({
    data: {
      id: seed.id,
      projectId,
      view: "OBSERVATIONS",
      filters: [] as unknown as Prisma.InputJsonValue,
      metric: {
        measure: "count",
        aggregation: "count",
      } as unknown as Prisma.InputJsonValue,
      windowMs: 5n * oneMinuteMs,
      cadenceMs: oneMinuteMs,
      thresholdOperator: "GT",
      alertThreshold: 100,
      warningThreshold: null,
      noData: { mode: "SILENT" } as unknown as Prisma.InputJsonValue,
      renotify: { mode: "OFF" } as unknown as Prisma.InputJsonValue,
      status: "ACTIVE",
      schedulerBatchId: 0n,
      nextRunAt: new Date("2099-01-01T00:00:00.000Z"),
      lastPublishedAt: null,
      lastClaimedAt: null,
      lastCompletedAt: seed.lastCompletedAt ?? null,
      severity: seed.severity ?? "UNKNOWN",
      severityChangedAt: seed.severityChangedAt ?? null,
      alertedAt: seed.alertedAt ?? null,
      name: `Test ${seed.id}`,
      tags: [],
    },
  });
}

const cases: CompleteCase[] = [
  {
    name: "no severity change, no emit: only last_completed_at advances",
    monitors: [
      {
        id: "m_steady",
        severity: "OK",
        severityChangedAt: tMinus10m,
        alertedAt: null,
        lastCompletedAt: tMinus10m,
      },
    ],
    completions: [
      {
        monitorId: "m_steady",
        lastCompletedAt: t0,
        severity: "OK",
        severityChangedAt: tMinus10m,
        alertedAt: null,
      },
    ],
    expect: {
      rows: [
        {
          id: "m_steady",
          severity: "OK",
          severityChangedAt: tMinus10m,
          alertedAt: null,
          lastCompletedAt: t0,
        },
      ],
    },
  },
  {
    name: "severity change, no emit (e.g. OK<->NO_DATA silent): severity + severityChangedAt + last_completed_at advance",
    monitors: [
      {
        id: "m_silent_no_data",
        severity: "OK",
        severityChangedAt: tMinus10m,
        alertedAt: null,
        lastCompletedAt: tMinus10m,
      },
    ],
    completions: [
      {
        monitorId: "m_silent_no_data",
        lastCompletedAt: t0,
        severity: "NO_DATA",
        severityChangedAt: t0,
        alertedAt: null,
      },
    ],
    expect: {
      rows: [
        {
          id: "m_silent_no_data",
          severity: "NO_DATA",
          severityChangedAt: t0,
          alertedAt: null,
          lastCompletedAt: t0,
        },
      ],
    },
  },
  {
    name: "no severity change, emit (renotify): alerted_at + last_completed_at advance",
    monitors: [
      {
        id: "m_renotify",
        severity: "ALERT",
        severityChangedAt: tMinus10m,
        alertedAt: tMinus10m,
        lastCompletedAt: tMinus10m,
      },
    ],
    completions: [
      {
        monitorId: "m_renotify",
        lastCompletedAt: t0,
        severity: "ALERT",
        severityChangedAt: tMinus10m,
        alertedAt: t0,
      },
    ],
    expect: {
      rows: [
        {
          id: "m_renotify",
          severity: "ALERT",
          severityChangedAt: tMinus10m,
          alertedAt: t0,
          lastCompletedAt: t0,
        },
      ],
    },
  },
  {
    name: "severity change + emit: all four stamps advance",
    monitors: [
      {
        id: "m_escalation",
        severity: "OK",
        severityChangedAt: tMinus10m,
        alertedAt: null,
        lastCompletedAt: tMinus10m,
      },
    ],
    completions: [
      {
        monitorId: "m_escalation",
        lastCompletedAt: t0,
        severity: "ALERT",
        severityChangedAt: t0,
        alertedAt: t0,
      },
    ],
    expect: {
      rows: [
        {
          id: "m_escalation",
          severity: "ALERT",
          severityChangedAt: t0,
          alertedAt: t0,
          lastCompletedAt: t0,
        },
      ],
    },
  },
  {
    name: "multi-monitor batch with mixed completions: every row updates per its own completion",
    monitors: [
      {
        id: "m_a_steady",
        severity: "OK",
        severityChangedAt: tMinus10m,
        alertedAt: null,
        lastCompletedAt: tMinus10m,
      },
      {
        id: "m_b_escalation",
        severity: "WARNING",
        severityChangedAt: tMinus10m,
        alertedAt: tMinus10m,
        lastCompletedAt: tMinus10m,
      },
      {
        id: "m_c_recovery",
        severity: "ALERT",
        severityChangedAt: tMinus10m,
        alertedAt: tMinus10m,
        lastCompletedAt: tMinus10m,
      },
    ],
    completions: [
      {
        monitorId: "m_a_steady",
        lastCompletedAt: t0,
        severity: "OK",
        severityChangedAt: tMinus10m,
        alertedAt: null,
      },
      {
        monitorId: "m_b_escalation",
        lastCompletedAt: t0,
        severity: "ALERT",
        severityChangedAt: t0,
        alertedAt: t0,
      },
      {
        monitorId: "m_c_recovery",
        lastCompletedAt: t0,
        severity: "OK",
        severityChangedAt: t0,
        alertedAt: t0,
      },
    ],
    expect: {
      rows: [
        {
          id: "m_a_steady",
          severity: "OK",
          severityChangedAt: tMinus10m,
          alertedAt: null,
          lastCompletedAt: t0,
        },
        {
          id: "m_b_escalation",
          severity: "ALERT",
          severityChangedAt: t0,
          alertedAt: t0,
          lastCompletedAt: t0,
        },
        {
          id: "m_c_recovery",
          severity: "OK",
          severityChangedAt: t0,
          alertedAt: t0,
          lastCompletedAt: t0,
        },
      ],
    },
  },
  {
    name: "empty completions: no-op (no error)",
    monitors: [
      {
        id: "m_untouched",
        severity: "OK",
        severityChangedAt: tMinus10m,
        alertedAt: null,
        lastCompletedAt: tMinus10m,
      },
    ],
    completions: [],
    expect: {
      rows: [
        {
          id: "m_untouched",
          severity: "OK",
          severityChangedAt: tMinus10m,
          alertedAt: null,
          lastCompletedAt: tMinus10m,
        },
      ],
    },
  },
  {
    name: "completion for non-existent monitor: silently ignored",
    monitors: [],
    completions: [
      {
        monitorId: "m_bogus",
        lastCompletedAt: t0,
        severity: "OK",
        severityChangedAt: t0,
        alertedAt: null,
      },
    ],
    expect: { rows: [] },
  },
];

describe("MonitorProcessor.complete (integration)", () => {
  let projectId: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
  });

  afterEach(async () => {
    await prisma.monitor.deleteMany({ where: { projectId } });
  });

  it.each(cases)("$name", async (c) => {
    for (const m of c.monitors) {
      await seedMonitor(projectId, m);
    }

    const processor = new MonitorProcessor({
      db: prisma,
      publish: async () => {},
    });
    await processor.complete({ projectId, completions: c.completions });

    for (const exp of c.expect.rows) {
      const row = await prisma.monitor.findUniqueOrThrow({
        where: { id: exp.id },
      });
      expect(row.severity).toBe(exp.severity);
      expect(row.severityChangedAt?.toISOString() ?? null).toBe(
        exp.severityChangedAt?.toISOString() ?? null,
      );
      expect(row.alertedAt?.toISOString() ?? null).toBe(
        exp.alertedAt?.toISOString() ?? null,
      );
      expect(row.lastCompletedAt?.toISOString() ?? null).toBe(
        exp.lastCompletedAt?.toISOString() ?? null,
      );
    }
  });

  it("scopes by projectId — a completion referencing a monitor in another project does not update it", async () => {
    await seedMonitor(projectId, {
      id: "m_in_project",
      severity: "OK",
      severityChangedAt: tMinus10m,
      lastCompletedAt: tMinus10m,
    });

    const processor = new MonitorProcessor({
      db: prisma,
      publish: async () => {},
    });
    await processor.complete({
      projectId: "proj_does_not_match",
      completions: [
        {
          monitorId: "m_in_project",
          lastCompletedAt: t0,
          severity: "ALERT",
          severityChangedAt: t0,
          alertedAt: t0,
        },
      ],
    });

    const row = await prisma.monitor.findUniqueOrThrow({
      where: { id: "m_in_project" },
    });
    expect(row.severity).toBe("OK");
    expect(row.severityChangedAt?.toISOString()).toBe(tMinus10m.toISOString());
    expect(row.alertedAt).toBeNull();
    expect(row.lastCompletedAt?.toISOString()).toBe(tMinus10m.toISOString());
  });
});
