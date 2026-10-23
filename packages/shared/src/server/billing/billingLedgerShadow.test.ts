import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  recordIncrement: vi.fn(),
  ledgerCounts: vi.fn(),
}));

vi.mock("../logger", () => ({ logger: mocks.logger }));
vi.mock("../instrumentation", () => ({
  recordIncrement: mocks.recordIncrement,
}));
vi.mock("../repositories/billable-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../repositories/billable-events")>()),
  getBillableUnitCountsByProjectInWindow: mocks.ledgerCounts,
}));

import { compareWithBillingLedger } from "./billingLedgerShadow";

const FROM = new Date("2026-10-16T08:00:00.000Z");
const TO = new Date("2026-10-16T09:00:00.000Z");

const incrementsOf = (stat: string) =>
  mocks.recordIncrement.mock.calls
    .filter(([name]) => name === stat)
    .map(([, value, tags]) => ({ value, tags }));

describe("compareWithBillingLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports unit totals and logs the projects with the largest gaps", async () => {
    mocks.ledgerCounts.mockResolvedValue([
      { projectId: "p-diverging", eventType: "observation", count: 200 },
      { projectId: "p-busy", eventType: "observation", count: 99_000 },
      { projectId: "p-steady", eventType: "observation", count: 9_990 },
      { projectId: "p-ledger-only", eventType: "score", count: 150 },
    ]);

    await compareWithBillingLedger({
      source: "stripe_metering",
      from: FROM,
      to: TO,
      legacy: {
        traces: [],
        observations: [
          { projectId: "p-diverging", count: 1_000 },
          // Below the unit threshold, but 100% of its usage, and one-sided.
          { projectId: "p-small", count: 50 },
          // Only 1% of its usage, but 1,000 units apart.
          { projectId: "p-busy", count: 100_000 },
          // 10 units and 0.1% apart: not diverging.
          { projectId: "p-steady", count: 10_000 },
        ],
        scores: [],
      },
      orgIdByProjectId: new Map([["p-diverging", "org-1"]]),
    });

    expect(mocks.ledgerCounts).toHaveBeenCalledWith({
      windowFrom: FROM,
      windowTo: TO,
      projectId: undefined,
    });
    expect(incrementsOf("langfuse.billing.ledger_shadow.units")).toEqual(
      expect.arrayContaining([
        {
          value: 111_050,
          tags: {
            source: "stripe_metering",
            side: "legacy",
            unit_type: "observation",
          },
        },
        {
          value: 109_190,
          tags: {
            source: "stripe_metering",
            side: "ledger",
            unit_type: "observation",
          },
        },
        {
          value: 150,
          tags: {
            source: "stripe_metering",
            side: "ledger",
            unit_type: "score",
          },
        },
      ]),
    );
    expect(
      incrementsOf("langfuse.billing.ledger_shadow.diverging_projects"),
    ).toEqual([{ value: 4, tags: { source: "stripe_metering" } }]);
    expect(
      incrementsOf("langfuse.billing.ledger_shadow.one_sided_projects"),
    ).toEqual([
      { value: 1, tags: { source: "stripe_metering", missing_from: "ledger" } },
      { value: 1, tags: { source: "stripe_metering", missing_from: "legacy" } },
    ]);

    expect(mocks.logger.info).toHaveBeenCalledTimes(1);
    const [, logged] = mocks.logger.info.mock.calls[0];
    expect(
      logged.projects.map(({ projectId, orgId }: Record<string, unknown>) => ({
        projectId,
        orgId,
      })),
    ).toEqual([
      { projectId: "p-busy", orgId: undefined },
      { projectId: "p-diverging", orgId: "org-1" },
      { projectId: "p-ledger-only", orgId: undefined },
      { projectId: "p-small", orgId: undefined },
    ]);
  });

  it("flags a project whose unit types diverge in opposite directions", async () => {
    mocks.ledgerCounts.mockResolvedValue([
      { projectId: "p-offsetting", eventType: "trace", count: 300 },
      { projectId: "p-offsetting", eventType: "score", count: 200 },
    ]);

    await compareWithBillingLedger({
      source: "stripe_metering",
      from: FROM,
      to: TO,
      legacy: {
        traces: [{ projectId: "p-offsetting", count: 500 }],
        observations: [],
        scores: [],
      },
    });

    expect(
      incrementsOf("langfuse.billing.ledger_shadow.diverging_projects"),
    ).toEqual([{ value: 1, tags: { source: "stripe_metering" } }]);
    const [, logged] = mocks.logger.info.mock.calls[0];
    expect(logged.projects[0].delta).toEqual({
      trace: -200,
      observation: 0,
      score: 200,
    });
  });

  it("does not throw when the ledger read fails", async () => {
    mocks.ledgerCounts.mockRejectedValue(
      new Error("Table billable_events does not exist"),
    );

    await expect(
      compareWithBillingLedger({
        source: "chb_metrics_api",
        from: FROM,
        to: new Date("2026-10-16T08:15:00.000Z"),
        projectId: "p-1",
        legacy: { traces: [], observations: [], scores: [] },
      }),
    ).resolves.toBeUndefined();

    expect(
      incrementsOf("langfuse.billing.ledger_shadow.failed_comparisons"),
    ).toEqual([{ value: 1, tags: { source: "chb_metrics_api" } }]);
    expect(mocks.logger.warn).toHaveBeenCalled();
  });

  it("reads the ledger for the exact range it is given", async () => {
    mocks.ledgerCounts.mockResolvedValue([]);
    const from = new Date("2026-10-16T08:05:00.000Z");
    const to = new Date("2026-10-16T08:20:00.000Z");

    await compareWithBillingLedger({
      source: "chb_metrics_api",
      from,
      to,
      projectId: "p-1",
      legacy: { traces: [], observations: [], scores: [] },
    });

    expect(mocks.ledgerCounts).toHaveBeenCalledWith({
      windowFrom: from,
      windowTo: to,
      projectId: "p-1",
    });
  });

  it("skips a range longer than an hour", async () => {
    await compareWithBillingLedger({
      source: "chb_metrics_api",
      from: FROM,
      to: new Date("2026-10-16T09:00:01.000Z"),
      projectId: "p-1",
      legacy: { traces: [], observations: [], scores: [] },
    });

    expect(mocks.ledgerCounts).not.toHaveBeenCalled();
    expect(
      incrementsOf("langfuse.billing.ledger_shadow.skipped_comparisons"),
    ).toEqual([
      {
        value: 1,
        tags: { source: "chb_metrics_api", reason: "unsupported_range" },
      },
    ]);
  });
});
