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
  getBillableUnitCountsByProjectInRange: mocks.ledgerCounts,
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
          // Below the unit threshold: not diverging, but one-sided.
          { projectId: "p-small", count: 50 },
          // 1,000 units apart, but only 1% of its usage.
          { projectId: "p-busy", count: 100_000 },
        ],
        scores: [],
      },
      orgIdByProjectId: new Map([["p-diverging", "org-1"]]),
    });

    expect(mocks.ledgerCounts).toHaveBeenCalledWith({
      from: FROM,
      to: TO,
      projectId: undefined,
    });
    expect(incrementsOf("langfuse.billing.ledger_shadow.units")).toEqual(
      expect.arrayContaining([
        {
          value: 101_050,
          tags: {
            source: "stripe_metering",
            side: "legacy",
            unit_type: "observation",
          },
        },
        {
          value: 99_200,
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
    ).toEqual([{ value: 2, tags: { source: "stripe_metering" } }]);
    expect(
      incrementsOf("langfuse.billing.ledger_shadow.one_sided_projects"),
    ).toEqual([
      { value: 1, tags: { source: "stripe_metering", missing_from: "ledger" } },
      { value: 1, tags: { source: "stripe_metering", missing_from: "legacy" } },
    ]);

    expect(mocks.logger.info).toHaveBeenCalledTimes(1);
    const [, logged] = mocks.logger.info.mock.calls[0];
    expect(
      logged.projects.map(
        ({ projectId, orgId, delta }: Record<string, unknown>) => ({
          projectId,
          orgId,
          delta,
        }),
      ),
    ).toEqual([
      { projectId: "p-diverging", orgId: "org-1", delta: -800 },
      { projectId: "p-ledger-only", orgId: undefined, delta: 150 },
    ]);
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

  it.each([
    [
      "off the 15-minute boundaries",
      "2026-10-16T08:05:00.000Z",
      "2026-10-16T08:20:00.000Z",
    ],
    [
      "longer than an hour",
      "2026-10-16T08:00:00.000Z",
      "2026-10-16T09:15:00.000Z",
    ],
  ])("skips a range %s", async (_label, from, to) => {
    await compareWithBillingLedger({
      source: "chb_metrics_api",
      from: new Date(from),
      to: new Date(to),
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
