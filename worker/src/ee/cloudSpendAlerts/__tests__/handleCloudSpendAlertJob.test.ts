import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

const {
  mockOrganizationFindFirst,
  mockMembershipFindMany,
  mockSpendAlertUpdate,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
  mockLoggerDebug,
  mockRecordIncrement,
  mockTraceException,
  mockSendCloudSpendAlertEmail,
  mockGetAttachedPlan,
  mockGetChbApiClient,
} = vi.hoisted(() => ({
  mockOrganizationFindFirst: vi.fn(),
  mockMembershipFindMany: vi.fn(),
  mockSpendAlertUpdate: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerDebug: vi.fn(),
  mockRecordIncrement: vi.fn(),
  mockTraceException: vi.fn(),
  mockSendCloudSpendAlertEmail: vi.fn(),
  mockGetAttachedPlan: vi.fn(),
  mockGetChbApiClient: vi.fn(),
}));

/**
 * The real `getBillingProvider`, not a stub: which provider a cloudConfig
 * resolves to is exactly what decides whether the job previews a Stripe
 * invoice or reads CHB's accrued usage, so stubbing it would test nothing.
 */
vi.mock("@langfuse/shared", async () => {
  const { getBillingProvider } =
    await import("../../../../../packages/shared/src/interfaces/billingProvider");
  return {
    getBillingProvider,
    parseDbOrg: (org: unknown) => org,
    Role: {
      ADMIN: "ADMIN",
      OWNER: "OWNER",
    },
  };
});

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    organization: {
      findFirst: mockOrganizationFindFirst,
    },
    organizationMembership: {
      findMany: mockMembershipFindMany,
    },
    cloudSpendAlert: {
      update: mockSpendAlertUpdate,
    },
  },
}));

/**
 * The real CHB helpers, not stand-ins: `chbPeriodUsageAmountUSD` encodes the
 * major-unit/USD-only contract these cases exist to pin, and `ChbApiError` is
 * what the job's status branching uses `instanceof` against. Only the
 * side-effecting exports (logging, metrics, email) are replaced.
 */
vi.mock("@langfuse/shared/src/server", async () => {
  const { CHB_USAGE_CURRENCY, ChbApiError, chbPeriodUsageAmountUSD } =
    await import("../../../../../packages/shared/src/server/clickhouseBilling/chbApiClient");
  return {
    logger: {
      info: mockLoggerInfo,
      warn: mockLoggerWarn,
      error: mockLoggerError,
      debug: mockLoggerDebug,
    },
    recordIncrement: mockRecordIncrement,
    traceException: mockTraceException,
    sendCloudSpendAlertEmail: mockSendCloudSpendAlertEmail,
    CHB_USAGE_CURRENCY,
    ChbApiError,
    chbPeriodUsageAmountUSD,
  };
});

vi.mock("../chbApiClient", () => ({
  getChbApiClient: mockGetChbApiClient,
}));

vi.mock("../../../env", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test",
    LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE: null,
  },
}));

import { ChbApiError } from "@langfuse/shared/src/server";

import { handleCloudSpendAlertJob } from "../handleCloudSpendAlertJob";

const createJob = (orgId = "org-1") =>
  ({
    data: { orgId },
  }) as Job<{ orgId: string }>;

const createOrg = (
  cloudConfig: Record<string, unknown>,
  alertOverrides: Partial<{
    id: string;
    title: string;
    threshold: string;
    triggeredAt: Date | null;
  }> = {},
) => ({
  id: "org-1",
  name: "Test Org",
  cloudConfig,
  cloudSpendAlerts: [
    {
      id: alertOverrides.id ?? "alert-1",
      title: alertOverrides.title ?? "Default Spend alert ($200)",
      threshold: { toString: () => alertOverrides.threshold ?? "200" },
      triggeredAt:
        alertOverrides.triggeredAt === undefined
          ? null
          : alertOverrides.triggeredAt,
    },
  ],
});

const CH_ORG_ID = "6dd6ab1d-9e8d-4c1a-8b4f-9a3d1e2c4b5a";

/** A CHB cloudConfig: attached plan present, no Stripe state at all. */
const chbCloudConfig = () => ({
  clickhouse: {
    organizationId: CH_ORG_ID,
    attachedPlanId: "ap_1",
    planCode: "LANGFUSE_CORE",
  },
});

const attachedPlan = (
  amount: number | null,
  currency: string | null = "USD",
  startDate: string | null = "2026-09-01T00:00:00.000Z",
) => ({
  id: "ap_1",
  plan: { code: "LANGFUSE_CORE" },
  period: {
    startDate,
    endDate: "2026-10-01T00:00:00.000Z",
    usage: { amount, currency },
  },
});

const skipReasons = () =>
  mockRecordIncrement.mock.calls
    .filter(
      (call) =>
        call[0] ===
        "langfuse.queue.cloud_spend_alert_queue.skipped_orgs_missing_billing_config",
    )
    .map((call) => (call[2] as { reason: string }).reason);

describe("handleCloudSpendAlertJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMembershipFindMany.mockResolvedValue([
      { user: { email: "owner@example.com" } },
    ]);
    mockSpendAlertUpdate.mockResolvedValue({});
    mockGetChbApiClient.mockReturnValue({
      getAttachedPlan: mockGetAttachedPlan,
    });
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

  describe("ClickHouse-billed organizations", () => {
    it("never reaches for Stripe state", async () => {
      mockOrganizationFindFirst.mockResolvedValue(createOrg(chbCloudConfig()));
      mockGetAttachedPlan.mockResolvedValue(attachedPlan(10));

      await handleCloudSpendAlertJob(createJob());

      // The Stripe branch's skip reasons are what a CHB org used to collect.
      expect(skipReasons()).toEqual([]);
      expect(mockGetAttachedPlan).toHaveBeenCalledWith({
        chOrganizationId: CH_ORG_ID,
      });
    });

    /**
     * CHB reports the accrued amount in major units — its own total is the sum
     * of line-item subtotals in ClickHouse Credits, rounded to two decimals,
     * and CHC converts 1:1 into USD. Reading it as minor units would put every
     * threshold 100x out of reach.
     */
    it("compares the accrued amount against the threshold as whole USD", async () => {
      mockOrganizationFindFirst.mockResolvedValue(createOrg(chbCloudConfig()));
      mockGetAttachedPlan.mockResolvedValue(attachedPlan(250.75));

      await handleCloudSpendAlertJob(createJob());

      expect(mockSendCloudSpendAlertEmail).toHaveBeenCalledTimes(1);
      expect(mockSendCloudSpendAlertEmail.mock.calls[0]![0]).toMatchObject({
        currentSpend: 250.75,
        threshold: 200,
        recipients: ["owner@example.com"],
      });
      expect(mockSpendAlertUpdate).toHaveBeenCalledWith({
        where: { id: "alert-1" },
        data: { triggeredAt: expect.any(Date) },
      });
    });

    it("does not alert below the threshold", async () => {
      mockOrganizationFindFirst.mockResolvedValue(createOrg(chbCloudConfig()));
      mockGetAttachedPlan.mockResolvedValue(attachedPlan(199.99));

      await handleCloudSpendAlertJob(createJob());

      expect(mockSendCloudSpendAlertEmail).not.toHaveBeenCalled();
      expect(mockSpendAlertUpdate).not.toHaveBeenCalled();
    });

    it("alerts once per billing period", async () => {
      mockOrganizationFindFirst.mockResolvedValue(
        createOrg(chbCloudConfig(), {
          // Already fired inside the period the attached plan reports.
          triggeredAt: new Date("2026-09-10T00:00:00.000Z"),
        }),
      );
      mockGetAttachedPlan.mockResolvedValue(attachedPlan(250));

      await handleCloudSpendAlertJob(createJob());

      expect(mockSendCloudSpendAlertEmail).not.toHaveBeenCalled();
      expect(mockSpendAlertUpdate).not.toHaveBeenCalled();
    });

    it("alerts again once the period has rolled over", async () => {
      mockOrganizationFindFirst.mockResolvedValue(
        createOrg(chbCloudConfig(), {
          // Fired in the previous period, which the plan's startDate ended.
          triggeredAt: new Date("2026-08-10T00:00:00.000Z"),
        }),
      );
      mockGetAttachedPlan.mockResolvedValue(attachedPlan(250));

      await handleCloudSpendAlertJob(createJob());

      expect(mockSendCloudSpendAlertEmail).toHaveBeenCalledTimes(1);
    });

    it("refuses a currency other than USD rather than comparing it", async () => {
      mockOrganizationFindFirst.mockResolvedValue(createOrg(chbCloudConfig()));
      mockGetAttachedPlan.mockResolvedValue(attachedPlan(5000, "EUR"));

      await handleCloudSpendAlertJob(createJob());

      expect(mockSendCloudSpendAlertEmail).not.toHaveBeenCalled();
      expect(skipReasons()).toContain("missing_chb_usage_amount");
    });

    it("skips when CHB reports no period start to scope the alert to", async () => {
      mockOrganizationFindFirst.mockResolvedValue(createOrg(chbCloudConfig()));
      mockGetAttachedPlan.mockResolvedValue(attachedPlan(250, "USD", null));

      await handleCloudSpendAlertJob(createJob());

      expect(mockSendCloudSpendAlertEmail).not.toHaveBeenCalled();
      expect(skipReasons()).toContain("missing_chb_period_start");
    });

    it("treats a 404 from CHB as a cancelled plan, not a failure", async () => {
      mockOrganizationFindFirst.mockResolvedValue(createOrg(chbCloudConfig()));
      mockGetAttachedPlan.mockRejectedValue(new ChbApiError("not found", 404));

      await expect(
        handleCloudSpendAlertJob(createJob()),
      ).resolves.toBeUndefined();

      expect(mockTraceException).not.toHaveBeenCalled();
      expect(skipReasons()).toContain("chb_attached_plan_not_found");
      // A 4xx must not burn the retry budget.
      expect(mockGetAttachedPlan).toHaveBeenCalledTimes(1);
    });

    it("skips an org whose attached plan was cancelled locally", async () => {
      mockOrganizationFindFirst.mockResolvedValue(
        createOrg({ clickhouse: { organizationId: CH_ORG_ID } }),
      );

      await handleCloudSpendAlertJob(createJob());

      expect(mockGetAttachedPlan).not.toHaveBeenCalled();
      expect(skipReasons()).toContain("missing_chb_attached_plan");
    });

    it("skips when CHB is not configured on this deployment", async () => {
      mockOrganizationFindFirst.mockResolvedValue(createOrg(chbCloudConfig()));
      mockGetChbApiClient.mockReturnValue(null);

      await handleCloudSpendAlertJob(createJob());

      expect(skipReasons()).toContain("chb_not_configured");
      expect(mockTraceException).not.toHaveBeenCalled();
    });

    it("retries and rethrows a CHB server error", async () => {
      mockOrganizationFindFirst.mockResolvedValue(createOrg(chbCloudConfig()));
      mockGetAttachedPlan.mockRejectedValue(new ChbApiError("boom", 500));

      await expect(handleCloudSpendAlertJob(createJob())).rejects.toThrow(
        "boom",
      );

      expect(mockGetAttachedPlan).toHaveBeenCalledTimes(3);
      expect(mockTraceException).toHaveBeenCalled();
      expect(mockRecordIncrement).toHaveBeenCalledWith(
        "langfuse.queue.cloud_spend_alert_queue.skipped_orgs_with_errors",
        1,
        { unit: "organizations" },
      );
    });
  });
});
