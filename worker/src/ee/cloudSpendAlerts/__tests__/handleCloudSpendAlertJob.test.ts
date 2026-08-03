import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

const {
  mockOrganizationFindFirst,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
  mockLoggerDebug,
  mockRecordIncrement,
  mockTraceException,
  mockSendCloudSpendAlertEmail,
} = vi.hoisted(() => ({
  mockOrganizationFindFirst: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerDebug: vi.fn(),
  mockRecordIncrement: vi.fn(),
  mockTraceException: vi.fn(),
  mockSendCloudSpendAlertEmail: vi.fn(),
}));

vi.mock("@langfuse/shared", () => ({
  parseDbOrg: (org: unknown) => org,
  Role: {
    ADMIN: "ADMIN",
    OWNER: "OWNER",
  },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    organization: {
      findFirst: mockOrganizationFindFirst,
    },
    organizationMembership: {
      findMany: vi.fn(),
    },
    cloudSpendAlert: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
  recordIncrement: mockRecordIncrement,
  traceException: mockTraceException,
  sendCloudSpendAlertEmail: mockSendCloudSpendAlertEmail,
}));

vi.mock("../../../env", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test",
  },
}));

import { handleCloudSpendAlertJob } from "../handleCloudSpendAlertJob";

const createJob = (orgId = "org-1") =>
  ({
    data: { orgId },
  }) as Job<{ orgId: string }>;

const createOrg = (cloudConfig: Record<string, unknown>) => ({
  id: "org-1",
  name: "Test Org",
  cloudConfig,
  cloudSpendAlerts: [
    {
      id: "alert-1",
      title: "Default Spend alert ($200)",
      threshold: { toString: () => "200" },
      triggeredAt: null,
    },
  ],
});

describe("handleCloudSpendAlertJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips with a healthy span when the Stripe customer id is missing", async () => {
    mockOrganizationFindFirst.mockResolvedValue(
      createOrg({
        plan: "cloud:core",
        stripe: {},
      }),
    );

    await expect(
      handleCloudSpendAlertJob(createJob()),
    ).resolves.toBeUndefined();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "[CLOUD SPEND ALERTS] Stripe customer id not found for org org-1",
    );
    expect(mockTraceException).not.toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      "langfuse.queue.cloud_spend_alert_queue.skipped_orgs_missing_billing_config",
      1,
      {
        unit: "organizations",
        reason: "missing_stripe_customer_id",
      },
    );
  });

  it("skips with a healthy span when the Stripe subscription id is missing", async () => {
    mockOrganizationFindFirst.mockResolvedValue(
      createOrg({
        plan: "cloud:core",
        stripe: {
          customerId: "cus_test",
        },
      }),
    );

    await expect(
      handleCloudSpendAlertJob(createJob()),
    ).resolves.toBeUndefined();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "[CLOUD SPEND ALERTS] Stripe subscription id not found for org org-1",
    );
    expect(mockTraceException).not.toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      "langfuse.queue.cloud_spend_alert_queue.skipped_orgs_missing_billing_config",
      1,
      {
        unit: "organizations",
        reason: "missing_stripe_subscription_id",
      },
    );
  });
});
