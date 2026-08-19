import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

const {
  mockCronJobsUpsert,
  mockCronJobsUpdate,
  mockOrganizationFindMany,
  mockMeterEventsCreate,
  mockUsageMeteringQueueAdd,
  mockSpendAlertQueueAdd,
  mockObservationCounts,
  mockTraceCounts,
  mockScoreCounts,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
  mockRecordIncrement,
  mockTraceException,
} = vi.hoisted(() => ({
  mockCronJobsUpsert: vi.fn(),
  mockCronJobsUpdate: vi.fn(),
  mockOrganizationFindMany: vi.fn(),
  mockMeterEventsCreate: vi.fn(),
  mockUsageMeteringQueueAdd: vi.fn(),
  mockSpendAlertQueueAdd: vi.fn(),
  mockObservationCounts: vi.fn(),
  mockTraceCounts: vi.fn(),
  mockScoreCounts: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockRecordIncrement: vi.fn(),
  mockTraceException: vi.fn(),
}));

vi.mock("@langfuse/shared", () => ({
  getBillingProvider: () => "stripe",
  parseDbOrg: (org: unknown) => org,
  Prisma: { DbNull: "DbNull" },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    cronJobs: {
      upsert: mockCronJobsUpsert,
      update: mockCronJobsUpdate,
    },
    organization: {
      findMany: mockOrganizationFindMany,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  CloudUsageMeteringQueue: {
    getInstance: () => ({ add: mockUsageMeteringQueueAdd }),
  },
  CloudSpendAlertQueue: {
    getInstance: () => ({ add: mockSpendAlertQueueAdd }),
  },
  getObservationCountsByProjectInCreationInterval: mockObservationCounts,
  getTraceCountsByProjectInCreationInterval: mockTraceCounts,
  getScoreCountsByProjectInCreationInterval: mockScoreCounts,
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
  QueueJobs: {
    CloudUsageMeteringJob: "cloud-usage-metering-job",
    CloudSpendAlertJob: "cloud-spend-alert-job",
  },
  recordIncrement: mockRecordIncrement,
  traceException: mockTraceException,
}));

vi.mock("stripe", () => ({
  default: class {
    billing = { meterEvents: { create: mockMeterEventsCreate } };
  },
}));

vi.mock("../../../env", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test",
    LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE: undefined,
  },
}));

import { handleCloudUsageMeteringJob } from "../handleCloudUsageMeteringJob";
import { CloudUsageMeteringDbCronJobStates } from "../constants";

// Mirrors the prod-eu incident: a run claims the 08:00-09:00 interval, dies
// partway through, and the next hourly tick takes the same interval over.
const NOW = new Date("2026-08-03T10:30:00.000Z");
const INTERVAL_START = new Date("2026-08-03T08:00:00.000Z");

const createJob = () =>
  ({
    updateProgress: vi.fn(),
  }) as unknown as Job;

const identifiersFromCalls = () =>
  mockMeterEventsCreate.mock.calls.map(([params]) => params.identifier);

describe("handleCloudUsageMeteringJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);

    mockCronJobsUpsert.mockResolvedValue({
      name: "cloud_usage_metering",
      lastRun: INTERVAL_START,
      state: CloudUsageMeteringDbCronJobStates.Queued,
      jobStartedAt: null,
    });
    mockCronJobsUpdate.mockResolvedValue({});
    mockOrganizationFindMany.mockResolvedValue([
      {
        id: "org-1",
        cloudConfig: { stripe: { customerId: "cus_1" } },
        projects: [{ id: "project-1" }],
        cloudSpendAlerts: [],
      },
    ]);
    mockObservationCounts.mockResolvedValue([
      { projectId: "project-1", count: 5 },
    ]);
    mockTraceCounts.mockResolvedValue([{ projectId: "project-1", count: 3 }]);
    mockScoreCounts.mockResolvedValue([{ projectId: "project-1", count: 2 }]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves the same meter event identifier when an interval is replayed", async () => {
    await handleCloudUsageMeteringJob(createJob());
    const firstRun = identifiersFromCalls();

    expect(firstRun).toHaveLength(2);
    expect(
      firstRun.every((id) => typeof id === "string" && id.length > 0),
    ).toBe(true);

    // lastRun never advanced, so the replay recomputes the same interval from
    // the top. Identical identifiers are what lets Stripe drop the duplicates
    // instead of summing them into the customer's usage.
    mockMeterEventsCreate.mockClear();
    await handleCloudUsageMeteringJob(createJob());

    expect(identifiersFromCalls()).toEqual(firstRun);
  });

  it("derives the identifier from the meter, the org and the interval", async () => {
    await handleCloudUsageMeteringJob(createJob());

    const byMeter = new Map(
      mockMeterEventsCreate.mock.calls.map(([params]) => [
        params.event_name,
        params.identifier,
      ]),
    );

    // Both meters are reported for the same org and interval, so event_name has
    // to be part of the key or Stripe would dedup them against each other and
    // silently drop one.
    expect(byMeter.get("tracing_observations")).not.toEqual(
      byMeter.get("tracing_events"),
    );
    for (const [eventName, identifier] of byMeter) {
      expect(identifier).toContain(eventName);
      expect(identifier).toContain("org-1");
      expect(identifier).toContain(String(INTERVAL_START.getTime()));
    }
  });

  it("advances lastRun under the lease it claimed", async () => {
    await handleCloudUsageMeteringJob(createJob());

    const closingCall = mockCronJobsUpdate.mock.calls.find(
      ([args]) => args.data.lastRun !== undefined,
    );
    const claimCall = mockCronJobsUpdate.mock.calls.find(
      ([args]) =>
        args.data.state === CloudUsageMeteringDbCronJobStates.Processing,
    );

    expect(claimCall).toBeDefined();
    expect(closingCall?.[0].where).toMatchObject({
      state: CloudUsageMeteringDbCronJobStates.Processing,
      jobStartedAt: claimCall?.[0].data.jobStartedAt,
    });
  });

  it("does not advance lastRun or re-enqueue when the interval was taken over", async () => {
    // The 20 minute stale-job takeover handed this interval to another run, so
    // the closing update no longer matches the lease this run claimed.
    mockCronJobsUpdate.mockImplementation(async ({ data }) => {
      if (data.lastRun !== undefined) {
        throw new Error("Record to update not found.");
      }
      return {};
    });

    await expect(
      handleCloudUsageMeteringJob(createJob()),
    ).resolves.toBeUndefined();

    // Throwing here would make the wrapper reset the state and replay the
    // interval a third time.
    expect(mockUsageMeteringQueueAdd).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });
});
