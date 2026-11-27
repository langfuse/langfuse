import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findMany,
  findUnique,
  updateMany,
  addBulk,
  recordDistribution,
  recordIncrement,
  notifyBlobStorageExportFailed,
  getOrganizationPlanServerSide,
} = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  addBulk: vi.fn(),
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
  notifyBlobStorageExportFailed: vi.fn(),
  getOrganizationPlanServerSide: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    blobStorageIntegration: { findMany, updateMany },
    project: { findUnique },
  },
}));

vi.mock("./terminalExportError", () => ({
  notifyBlobStorageExportFailed,
}));

vi.mock("@langfuse/shared/src/server", () => ({
  BlobStorageIntegrationProcessingQueue: {
    getInstance: () => ({ addBulk, clean: vi.fn() }),
  },
  QueueJobs: { BlobStorageIntegrationProcessingJob: "job" },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  recordDistribution,
  recordIncrement,
  getOrganizationPlanServerSide,
}));

import { handleBlobStorageIntegrationSchedule } from "./handleBlobStorageIntegrationSchedule";
import { PLAN_DISABLED_ERROR } from "./planDisable";
import { EXPORT_STALENESS_METRIC } from "../../services/exportStalenessMetric";
import { BLOB_INTEGRATION_DISABLED_METRIC } from "./isCustomerFaultError";

const withCloudConfig = (cloudConfig: unknown) => ({
  project: { organization: { cloudConfig } },
});

describe("handleBlobStorageIntegrationSchedule", () => {
  const now = new Date("2026-09-28T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now });
    // Self-hosted: every plan includes scheduled exports.
    getOrganizationPlanServerSide.mockReturnValue("oss");
    // The disable path re-reads the organization; by default its plan is
    // unchanged since the tick's snapshot.
    findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        const rows: { projectId: string; project: unknown }[] =
          await findMany.mock.results[0].value;
        return rows.find((row) => row.projectId === where.id)?.project;
      },
    );
  });

  it("emits staleness for every enabled integration but enqueues only due ones", async () => {
    findMany.mockResolvedValue([
      {
        projectId: "due",
        exportFrequency: "every_20_minutes",
        lastSyncAt: new Date("2026-09-28T11:20:00.000Z"),
        nextSyncAt: new Date("2026-09-28T11:59:00.000Z"),
        backfill: false,
        ...withCloudConfig(null),
      },
      {
        // Stalled: watermark is a day old but nextSyncAt says not due.
        projectId: "stalled",
        exportFrequency: "hourly",
        lastSyncAt: new Date("2026-09-27T12:00:00.000Z"),
        nextSyncAt: new Date("2026-09-28T13:00:00.000Z"),
        backfill: true,
        ...withCloudConfig(null),
      },
      {
        projectId: "never-synced",
        exportFrequency: "daily",
        lastSyncAt: null,
        nextSyncAt: null,
        backfill: true,
        ...withCloudConfig(null),
      },
    ]);

    await handleBlobStorageIntegrationSchedule();

    expect(recordDistribution.mock.calls).toEqual([
      [
        EXPORT_STALENESS_METRIC,
        40 * 60,
        {
          integration: "blob_storage",
          window: "20m",
          backfill: "false",
          unit: "seconds",
        },
      ],
      [
        EXPORT_STALENESS_METRIC,
        24 * 60 * 60,
        {
          integration: "blob_storage",
          window: "1h",
          backfill: "true",
          unit: "seconds",
        },
      ],
    ]);
    const enqueued = addBulk.mock.calls[0][0].map(
      (job: { data: { payload: { projectId: string } } }) =>
        job.data.payload.projectId,
    );
    expect(enqueued).toEqual(["due", "never-synced"]);
  });

  it("emits staleness even when nothing is due", async () => {
    findMany.mockResolvedValue([
      {
        projectId: "stalled",
        exportFrequency: "monthly",
        lastSyncAt: new Date("2026-09-28T10:00:00.000Z"),
        nextSyncAt: new Date("2026-09-28T13:00:00.000Z"),
        backfill: false,
        ...withCloudConfig(null),
      },
    ]);

    await handleBlobStorageIntegrationSchedule();

    expect(recordDistribution).toHaveBeenCalledWith(
      EXPORT_STALENESS_METRIC,
      2 * 60 * 60,
      {
        integration: "blob_storage",
        window: "unknown",
        backfill: "false",
        unit: "seconds",
      },
    );
    expect(addBulk).not.toHaveBeenCalled();
  });

  describe("on Cloud", () => {
    beforeEach(() => {
      getOrganizationPlanServerSide.mockImplementation(
        (cloudConfig?: { plan?: string }) =>
          cloudConfig?.plan === "Team" ? "cloud:team" : "cloud:pro",
      );
    });

    it("disables integrations whose plan lost scheduled exports instead of enqueueing them", async () => {
      const due = {
        exportFrequency: "hourly",
        lastSyncAt: new Date("2026-09-28T10:00:00.000Z"),
        nextSyncAt: new Date("2026-09-28T11:00:00.000Z"),
        backfill: false,
      };
      findMany.mockResolvedValue([
        { ...due, projectId: "team", ...withCloudConfig({ plan: "Team" }) },
        { ...due, projectId: "pro", ...withCloudConfig({ plan: "Pro" }) },
      ]);
      updateMany.mockResolvedValue({ count: 1 });

      await handleBlobStorageIntegrationSchedule();

      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenCalledWith({
        where: { projectId: "pro", enabled: true },
        data: {
          enabled: false,
          lastError: PLAN_DISABLED_ERROR,
          lastErrorAt: now,
        },
      });
      expect(recordIncrement).toHaveBeenCalledWith(
        BLOB_INTEGRATION_DISABLED_METRIC,
        1,
        { reason: "plan" },
      );
      expect(notifyBlobStorageExportFailed).toHaveBeenCalledWith("pro", {
        disabledMessage: expect.any(Function),
      });
      expect(recordDistribution).toHaveBeenCalledTimes(1);
      const enqueued = addBulk.mock.calls[0][0].map(
        (job: { data: { payload: { projectId: string } } }) =>
          job.data.payload.projectId,
      );
      expect(enqueued).toEqual(["team"]);
    });

    it.each([
      {
        label: "a ClickHouse Billing plan code it does not recognize",
        cloudConfig: {
          clickhouse: {
            organizationId: "0d5e6f7a-1b2c-4d3e-8f9a-0b1c2d3e4f5a",
            planCode: "scale",
          },
        },
      },
      {
        label: "an attached ClickHouse Billing plan without a plan code",
        cloudConfig: {
          clickhouse: {
            organizationId: "0d5e6f7a-1b2c-4d3e-8f9a-0b1c2d3e4f5a",
            attachedPlanId: "plan_1",
          },
        },
      },
      {
        label: "a Stripe product id missing from the product map",
        cloudConfig: {
          stripe: { customerId: "cus_1", activeProductId: "prod_unknown" },
        },
      },
    ])("keeps exporting for $label", async ({ cloudConfig }) => {
      findMany.mockResolvedValue([
        {
          projectId: "unknown-plan",
          exportFrequency: "hourly",
          lastSyncAt: null,
          nextSyncAt: null,
          backfill: false,
          ...withCloudConfig(cloudConfig),
        },
      ]);

      await handleBlobStorageIntegrationSchedule();

      expect(updateMany).not.toHaveBeenCalled();
      expect(addBulk).toHaveBeenCalledTimes(1);
    });

    it("disables a ClickHouse Billing org whose plan was cancelled", async () => {
      findMany.mockResolvedValue([
        {
          projectId: "chb-cancelled",
          exportFrequency: "hourly",
          lastSyncAt: null,
          nextSyncAt: null,
          backfill: false,
          ...withCloudConfig({
            clickhouse: {
              organizationId: "0d5e6f7a-1b2c-4d3e-8f9a-0b1c2d3e4f5a",
            },
          }),
        },
      ]);
      updateMany.mockResolvedValue({ count: 1 });

      await handleBlobStorageIntegrationSchedule();

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: "chb-cancelled", enabled: true },
        }),
      );
      expect(addBulk).not.toHaveBeenCalled();
    });

    it("keeps an integration whose organization upgraded after the tick read its plan", async () => {
      findMany.mockResolvedValue([
        {
          projectId: "upgraded",
          exportFrequency: "hourly",
          lastSyncAt: null,
          nextSyncAt: null,
          backfill: false,
          ...withCloudConfig({ plan: "Pro" }),
        },
      ]);
      findUnique.mockResolvedValue(withCloudConfig({ plan: "Team" }).project);

      await handleBlobStorageIntegrationSchedule();

      expect(updateMany).not.toHaveBeenCalled();
      expect(notifyBlobStorageExportFailed).not.toHaveBeenCalled();
    });

    it("does not notify when another tick already disabled the integration", async () => {
      findMany.mockResolvedValue([
        {
          projectId: "hobby",
          exportFrequency: "hourly",
          lastSyncAt: null,
          nextSyncAt: null,
          backfill: false,
          ...withCloudConfig(null),
        },
      ]);
      updateMany.mockResolvedValue({ count: 0 });

      await handleBlobStorageIntegrationSchedule();

      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(recordIncrement).not.toHaveBeenCalled();
      expect(notifyBlobStorageExportFailed).not.toHaveBeenCalled();
      expect(addBulk).not.toHaveBeenCalled();
    });
  });
});
