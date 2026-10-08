import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockOrganizationFindMany,
  mockQueueAdd,
  mockGetQueueInstance,
  mockIsChbConfigured,
  mockLoggerInfo,
  mockLoggerError,
  mockLoggerDebug,
  mockRecordIncrement,
} = vi.hoisted(() => ({
  mockOrganizationFindMany: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockGetQueueInstance: vi.fn(),
  mockIsChbConfigured: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerDebug: vi.fn(),
  mockRecordIncrement: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { organization: { findMany: mockOrganizationFindMany } },
  Prisma: { DbNull: Symbol("DbNull") },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  CloudSpendAlertQueue: { getInstance: mockGetQueueInstance },
  QueueJobs: { CloudSpendAlertJob: "cloud-spend-alert-job" },
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    debug: mockLoggerDebug,
    warn: vi.fn(),
  },
  recordIncrement: mockRecordIncrement,
}));

vi.mock("../chbApiClient", () => ({
  isChbConfigured: mockIsChbConfigured,
}));

import { Prisma } from "@langfuse/shared/src/db";

import { handleCloudSpendAlertFanOutJob } from "../handleCloudSpendAlertFanOutJob";

describe("handleCloudSpendAlertFanOutJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsChbConfigured.mockReturnValue(true);
    mockGetQueueInstance.mockReturnValue({ add: mockQueueAdd });
    mockQueueAdd.mockResolvedValue({});
    mockOrganizationFindMany.mockResolvedValue([]);
  });

  it("does nothing on a deployment without CHB", async () => {
    mockIsChbConfigured.mockReturnValue(false);

    await handleCloudSpendAlertFanOutJob();

    expect(mockOrganizationFindMany).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  /**
   * Scoping matters in both directions: an org without an attached plan has
   * nothing accruing, and a Stripe-billed org is already enqueued by the usage
   * metering job — including it here would double its preview-invoice calls.
   */
  it("selects only ClickHouse-billed orgs that have alerts configured", async () => {
    await handleCloudSpendAlertFanOutJob();

    expect(mockOrganizationFindMany).toHaveBeenCalledWith({
      where: {
        cloudConfig: {
          path: ["clickhouse", "attachedPlanId"],
          not: Prisma.DbNull,
        },
        cloudSpendAlerts: { some: {} },
      },
      select: { id: true },
    });
  });

  it("enqueues one evaluation job per org", async () => {
    mockOrganizationFindMany.mockResolvedValue([
      { id: "org-1" },
      { id: "org-2" },
    ]);

    await handleCloudSpendAlertFanOutJob();

    expect(mockQueueAdd.mock.calls).toEqual([
      ["cloud-spend-alert-job", { orgId: "org-1" }],
      ["cloud-spend-alert-job", { orgId: "org-2" }],
    ]);
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      "langfuse.queue.cloud_spend_alert_queue.fanned_out_orgs",
      2,
      { unit: "organizations" },
    );
  });

  it("keeps going when one org fails to enqueue", async () => {
    mockOrganizationFindMany.mockResolvedValue([
      { id: "org-1" },
      { id: "org-2" },
      { id: "org-3" },
    ]);
    mockQueueAdd.mockRejectedValueOnce(new Error("redis blip"));

    await expect(handleCloudSpendAlertFanOutJob()).resolves.toBeUndefined();

    expect(mockQueueAdd).toHaveBeenCalledTimes(3);
    expect(mockLoggerError).toHaveBeenCalled();
    // Only the orgs actually enqueued are counted.
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      "langfuse.queue.cloud_spend_alert_queue.fanned_out_orgs",
      2,
      { unit: "organizations" },
    );
  });

  it("does not touch the queue when there is nothing to fan out", async () => {
    await handleCloudSpendAlertFanOutJob();

    expect(mockGetQueueInstance).not.toHaveBeenCalled();
  });
});
