import { v4 } from "uuid";
import { vi } from "vitest";

import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import {
  MonitorProcessor,
  type MonitorPublisher,
  type MonitorQueueEvent,
} from "@langfuse/shared/monitors/server";
import { prisma } from "@langfuse/shared/src/db";
import type { Prisma } from "@prisma/client";

type SeedOverrides = Partial<{
  id: string;
  schedulerBatchId: bigint;
  windowMs: bigint;
  status: "ACTIVE" | "PAUSED" | "ERROR_BAD_QUERY";
  view: "OBSERVATIONS" | "SCORES_NUMERIC" | "SCORES_CATEGORICAL";
  alertThreshold: number;
  warningThreshold: number | null;
  thresholdOperator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "NEQ";
  noData: { mode: "SILENT" } | { mode: "NOTIFY"; intervalMinutes: number };
  renotify: { mode: "OFF" } | { mode: "EVERY"; intervalMinutes: number };
  severity: "UNKNOWN" | "OK" | "WARNING" | "ALERT" | "NO_DATA" | "PAUSED";
  severityChangedAt: Date | null;
  alertedAt: Date | null;
  tags: string[];
  lastPublishedRunAt: Date | null;
  lastClaimedRunAt: Date | null;
  lastCompletedRunAt: Date | null;
}>;

type MonitorSeed = { id: string } & SeedOverrides;

const oneMinuteMs = 60n * 1000n;
const fiveMinutesMs = 5n * oneMinuteMs;

const runAt = new Date("2026-05-27T12:00:00.000Z");
const tenMinutesAgo = new Date("2026-05-27T11:50:00.000Z");
const justAfterRunAt = new Date("2026-05-27T12:00:01.000Z");

async function seedMonitor(projectId: string, seed: MonitorSeed) {
  return prisma.monitor.create({
    data: {
      id: seed.id,
      projectId,
      view: seed.view ?? "OBSERVATIONS",
      filters: [] as unknown as Prisma.InputJsonValue,
      metric: {
        measure: "count",
        aggregation: "count",
      } as unknown as Prisma.InputJsonValue,
      windowMs: seed.windowMs ?? fiveMinutesMs,
      cadenceMs: oneMinuteMs,
      thresholdOperator: seed.thresholdOperator ?? "GT",
      alertThreshold: seed.alertThreshold ?? 100,
      warningThreshold: seed.warningThreshold ?? null,
      noData: (seed.noData ?? {
        mode: "SILENT",
      }) as unknown as Prisma.InputJsonValue,
      renotify: (seed.renotify ?? {
        mode: "OFF",
      }) as unknown as Prisma.InputJsonValue,
      status: seed.status ?? "ACTIVE",
      schedulerBatchId: seed.schedulerBatchId ?? 0n,
      nextRunAt: null,
      lastPublishedRunAt: seed.lastPublishedRunAt ?? null,
      lastClaimedRunAt: seed.lastClaimedRunAt ?? null,
      lastCompletedRunAt: seed.lastCompletedRunAt ?? null,
      severity: seed.severity ?? "UNKNOWN",
      severityChangedAt: seed.severityChangedAt ?? null,
      alertedAt: seed.alertedAt ?? null,
      tags: seed.tags ?? [],
      name: `Test ${seed.id}`,
    },
  });
}

/** seedObservationsInWindow inserts `count` observations spread evenly across the window ending at runAt. */
async function seedObservationsInWindow(args: {
  projectId: string;
  count: number;
  runAt: Date;
  windowMs: number;
}) {
  if (args.count === 0) return;
  const stepMs = Math.max(1, Math.floor(args.windowMs / args.count));
  const startMs = args.runAt.getTime() - args.windowMs;
  const observations = Array.from({ length: args.count }, (_, i) =>
    createObservation({
      project_id: args.projectId,
      start_time: startMs + i * stepMs,
      end_time: startMs + i * stepMs,
      event_ts: startMs + i * stepMs,
    }),
  );
  await createObservationsCh(observations);
}

async function seedTrigger(
  projectId: string,
  filter: { column: string; operator: string; value: unknown; type: string }[],
) {
  return prisma.trigger.create({
    data: {
      projectId,
      eventSource: "monitor",
      eventActions: [],
      filter: filter as unknown as Prisma.InputJsonValue,
      status: "ACTIVE",
    },
  });
}

function makeEvent(args: {
  projectId: string;
  monitorIds: string[];
  runAt?: Date;
  windowMs?: bigint;
}): MonitorQueueEvent {
  return {
    projectId: args.projectId,
    schedulerBatchId: 0n,
    runAt: args.runAt ?? runAt,
    view: "observations",
    filters: [],
    window: "5m",
    metrics: [{ measure: "count", aggregation: "count" }],
    monitors: args.monitorIds.map((id) => ({
      monitorId: id,
      metricName: "count_count",
    })),
  };
}

describe("MonitorProcessor.process — shell (integration)", () => {
  let projectId: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
  });

  afterEach(async () => {
    await prisma.monitor.deleteMany({ where: { projectId } });
  });

  it("case A: claim is empty -> no CH query, no complete, no publish", async () => {
    const publish = vi.fn<MonitorPublisher>(async () => {});
    const processor = new MonitorProcessor({ db: prisma, publish });

    // No monitors in the event -> claim returns []
    await processor.process(makeEvent({ projectId, monitorIds: [] }), runAt);

    expect(publish).not.toHaveBeenCalled();
  });

  it("case C: single monitor, OK -> OK steady state -> only last_completed_run_at advances", async () => {
    const monitorId = `m_ok_${v4()}`;
    await seedMonitor(projectId, {
      id: monitorId,
      severity: "OK",
      severityChangedAt: tenMinutesAgo,
      alertedAt: null,
      lastPublishedRunAt: runAt,
      lastClaimedRunAt: null,
      lastCompletedRunAt: null,
      alertThreshold: 100,
      thresholdOperator: "GT",
    });
    // 50 observations is below the alert threshold of 100 -> computed OK.
    await seedObservationsInWindow({
      projectId,
      count: 50,
      runAt,
      windowMs: 5 * 60 * 1000,
    });

    const publish = vi.fn<MonitorPublisher>(async () => {});
    const processor = new MonitorProcessor({ db: prisma, publish });
    await processor.process(
      makeEvent({ projectId, monitorIds: [monitorId] }),
      justAfterRunAt,
    );

    expect(publish).not.toHaveBeenCalled();
    const row = await prisma.monitor.findUniqueOrThrow({
      where: { id: monitorId },
    });
    expect(row.severity).toBe("OK");
    expect(row.severityChangedAt?.toISOString()).toBe(
      tenMinutesAgo.toISOString(),
    );
    expect(row.alertedAt).toBeNull();
    expect(row.lastCompletedRunAt?.toISOString()).toBe(runAt.toISOString());
  });

  it("case E: cold-start UNKNOWN -> ALERT -> state machine emits (alertedAt advances); publisher seam unused in this commit", async () => {
    // NOTE: NO_DATA semantics are hard to test with count() (returns 0 on
    // empty in ClickHouse, not NULL). Substitute a cold-start UNKNOWN -> ALERT
    // case that exercises the emit branch of the state machine. NO_DATA can
    // come back as a follow-up when we wire a NULL-returning aggregation.
    const monitorId = `m_cold_start_alert_${v4()}`;
    await seedMonitor(projectId, {
      id: monitorId,
      severity: "UNKNOWN",
      severityChangedAt: null,
      alertedAt: null,
      lastPublishedRunAt: runAt,
      lastClaimedRunAt: null,
      lastCompletedRunAt: null,
      alertThreshold: 100,
      thresholdOperator: "GT",
    });
    // 142 observations crosses the alert threshold of 100 -> computed ALERT.
    await seedObservationsInWindow({
      projectId,
      count: 142,
      runAt,
      windowMs: 5 * 60 * 1000,
    });

    const publish = vi.fn<MonitorPublisher>(async () => {});
    const processor = new MonitorProcessor({ db: prisma, publish });
    await processor.process(
      makeEvent({ projectId, monitorIds: [monitorId] }),
      justAfterRunAt,
    );

    // Commit 1 does not call the publisher even when the state machine emits.
    expect(publish).not.toHaveBeenCalled();
    const row = await prisma.monitor.findUniqueOrThrow({
      where: { id: monitorId },
    });
    expect(row.severity).toBe("ALERT");
    expect(row.severityChangedAt?.toISOString()).toBe(runAt.toISOString());
    expect(row.alertedAt?.toISOString()).toBe(runAt.toISOString());
    expect(row.lastCompletedRunAt?.toISOString()).toBe(runAt.toISOString());
  });

  it("case F: partial claim (1 of 2 already done) -> only claimable processed", async () => {
    const claimableId = `m_claimable_${v4()}`;
    const doneId = `m_done_${v4()}`;
    // Both share the same scheduler batch, both have last_published_run_at == event.runAt.
    // The done row also has last_completed_run_at == event.runAt (already finished),
    // so claim's clause 2 rejects it.
    await seedMonitor(projectId, {
      id: claimableId,
      schedulerBatchId: 7n,
      severity: "OK",
      severityChangedAt: tenMinutesAgo,
      lastPublishedRunAt: runAt,
      lastClaimedRunAt: null,
      lastCompletedRunAt: null,
    });
    await seedMonitor(projectId, {
      id: doneId,
      schedulerBatchId: 7n,
      severity: "OK",
      severityChangedAt: tenMinutesAgo,
      lastPublishedRunAt: runAt,
      lastClaimedRunAt: runAt,
      lastCompletedRunAt: runAt, // already done
    });
    await seedObservationsInWindow({
      projectId,
      count: 50,
      runAt,
      windowMs: 5 * 60 * 1000,
    });

    const publish = vi.fn<MonitorPublisher>(async () => {});
    const processor = new MonitorProcessor({ db: prisma, publish });
    await processor.process(
      makeEvent({
        projectId,
        monitorIds: [claimableId, doneId],
        runAt,
      }),
      justAfterRunAt,
    );

    expect(publish).not.toHaveBeenCalled();
    const claimable = await prisma.monitor.findUniqueOrThrow({
      where: { id: claimableId },
    });
    const done = await prisma.monitor.findUniqueOrThrow({
      where: { id: doneId },
    });
    // claimable processed -> last_completed_run_at advanced
    expect(claimable.lastCompletedRunAt?.toISOString()).toBe(
      runAt.toISOString(),
    );
    // done row untouched -> last_completed_run_at unchanged (still == runAt)
    expect(done.lastCompletedRunAt?.toISOString()).toBe(runAt.toISOString());
    // and severity/severityChangedAt on the done row are NOT rewritten.
    expect(done.severity).toBe("OK");
    expect(done.severityChangedAt?.toISOString()).toBe(
      tenMinutesAgo.toISOString(),
    );
  });
});

describe("MonitorProcessor.process — trigger filter + publisher emit (integration)", () => {
  let projectId: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
  });

  afterEach(async () => {
    await prisma.monitor.deleteMany({ where: { projectId } });
    await prisma.trigger.deleteMany({ where: { projectId } });
  });

  it("case B: cold-start ALERT + matching severity trigger -> publish called once with the expected payload", async () => {
    const monitorId = `m_alert_${v4()}`;
    await seedMonitor(projectId, {
      id: monitorId,
      severity: "UNKNOWN",
      lastPublishedRunAt: runAt,
      alertThreshold: 100,
      thresholdOperator: "GT",
    });
    await seedObservationsInWindow({
      projectId,
      count: 142,
      runAt,
      windowMs: 5 * 60 * 1000,
    });
    await seedTrigger(projectId, [
      {
        column: "severity",
        operator: "any of",
        value: ["ALERT"],
        type: "stringOptions",
      },
    ]);

    const publish = vi.fn<MonitorPublisher>(async () => {});
    const processor = new MonitorProcessor({ db: prisma, publish });
    await processor.process(
      makeEvent({ projectId, monitorIds: [monitorId] }),
      justAfterRunAt,
    );

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toMatchObject({
      type: "monitor-alert",
      version: "v1",
      payload: {
        monitorId,
        projectId,
        severity: "ALERT",
        message: {
          title: `[ALERT] Test ${monitorId}`,
          body: "count(observations.count) is above 100",
        },
        view: "observations",
        window: "5m",
      },
    });
    expect(publish.mock.calls[0][0].payload.timestamp.toISOString()).toBe(
      runAt.toISOString(),
    );

    const row = await prisma.monitor.findUniqueOrThrow({
      where: { id: monitorId },
    });
    expect(row.severity).toBe("ALERT");
    expect(row.severityChangedAt?.toISOString()).toBe(runAt.toISOString());
    expect(row.alertedAt?.toISOString()).toBe(runAt.toISOString());
    expect(row.lastCompletedRunAt?.toISOString()).toBe(runAt.toISOString());
  });

  it("case D: emit but NO matching trigger -> publish NOT called; row still written per state machine", async () => {
    const monitorId = `m_no_match_${v4()}`;
    await seedMonitor(projectId, {
      id: monitorId,
      severity: "UNKNOWN",
      lastPublishedRunAt: runAt,
      alertThreshold: 100,
      thresholdOperator: "GT",
    });
    await seedObservationsInWindow({
      projectId,
      count: 142,
      runAt,
      windowMs: 5 * 60 * 1000,
    });
    // Trigger only matches WARNING; monitor emits ALERT -> no match.
    await seedTrigger(projectId, [
      {
        column: "severity",
        operator: "any of",
        value: ["WARNING"],
        type: "stringOptions",
      },
    ]);

    const publish = vi.fn<MonitorPublisher>(async () => {});
    const processor = new MonitorProcessor({ db: prisma, publish });
    await processor.process(
      makeEvent({ projectId, monitorIds: [monitorId] }),
      justAfterRunAt,
    );

    expect(publish).not.toHaveBeenCalled();
    // State machine still ran; lifecycle stamps reflect the emit decision.
    const row = await prisma.monitor.findUniqueOrThrow({
      where: { id: monitorId },
    });
    expect(row.severity).toBe("ALERT");
    expect(row.severityChangedAt?.toISOString()).toBe(runAt.toISOString());
    expect(row.alertedAt?.toISOString()).toBe(runAt.toISOString());
    expect(row.lastCompletedRunAt?.toISOString()).toBe(runAt.toISOString());
  });

  it("case G: trigger filter on tags matches -> publish called once", async () => {
    const monitorId = `m_tags_${v4()}`;
    await seedMonitor(projectId, {
      id: monitorId,
      severity: "UNKNOWN",
      lastPublishedRunAt: runAt,
      alertThreshold: 100,
      thresholdOperator: "GT",
      tags: ["env:prod", "service:faq-bot"],
    });
    await seedObservationsInWindow({
      projectId,
      count: 142,
      runAt,
      windowMs: 5 * 60 * 1000,
    });
    await seedTrigger(projectId, [
      {
        column: "tags",
        operator: "any of",
        value: ["env:prod"],
        type: "arrayOptions",
      },
    ]);

    const publish = vi.fn<MonitorPublisher>(async () => {});
    const processor = new MonitorProcessor({ db: prisma, publish });
    await processor.process(
      makeEvent({ projectId, monitorIds: [monitorId] }),
      justAfterRunAt,
    );

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("case H: multiple triggers, one matches -> publish called ONCE per surviving Monitor (not per trigger)", async () => {
    const monitorId = `m_multi_${v4()}`;
    await seedMonitor(projectId, {
      id: monitorId,
      severity: "UNKNOWN",
      lastPublishedRunAt: runAt,
      alertThreshold: 100,
      thresholdOperator: "GT",
    });
    await seedObservationsInWindow({
      projectId,
      count: 142,
      runAt,
      windowMs: 5 * 60 * 1000,
    });
    // Two triggers: one matches WARNING (won't match ALERT), one matches ALERT.
    await seedTrigger(projectId, [
      {
        column: "severity",
        operator: "any of",
        value: ["WARNING"],
        type: "stringOptions",
      },
    ]);
    await seedTrigger(projectId, [
      {
        column: "severity",
        operator: "any of",
        value: ["ALERT"],
        type: "stringOptions",
      },
    ]);

    const publish = vi.fn<MonitorPublisher>(async () => {});
    const processor = new MonitorProcessor({ db: prisma, publish });
    await processor.process(
      makeEvent({ projectId, monitorIds: [monitorId] }),
      justAfterRunAt,
    );

    // RFC step 9: one MonitorWebhookQueueEvent per surviving Monitor.
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
