import { describe, it, expect, beforeEach, vi } from "vitest";
import { type Mock } from "vitest";

// Hoist environment variable setting to ensure it happens before module initialization
vi.hoisted(() => {
  process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED = "true";
});

// Mock prisma
vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    organization: {
      update: vi.fn(),
    },
    organizationMembership: {
      findMany: vi.fn(),
    },
    apiKey: {
      findMany: vi.fn(),
    },
  },
}));

import { processThresholds } from "../ee/usageThresholds/thresholdProcessing";
import { prisma } from "@langfuse/shared/src/db";
import { type ParsedOrganization } from "@langfuse/shared";

const mockOrgUpdate = prisma.organization.update as Mock;
const mockOrgMembershipFindMany = prisma.organizationMembership
  .findMany as Mock;
const mockApiKeyFindMany = prisma.apiKey.findMany as Mock;

// Mock organization helper
const createMockOrg = (
  overrides: Partial<ParsedOrganization> = {},
): ParsedOrganization => ({
  id: "org-1",
  name: "Test Org",
  cloudConfig: null,
  metadata: null,
  cloudBillingCycleAnchor: new Date("2024-01-15T00:00:00Z"),
  cloudBillingCycleUpdatedAt: null,
  cloudCurrentCycleUsage: null,
  cloudFreeTierUsageThresholdState: null,
  aiFeaturesEnabled: false,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
  ...overrides,
});

describe("processThresholds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrgUpdate.mockResolvedValue({} as any);
    // Mock empty admin list - emails won't be sent but threshold logic will execute
    mockOrgMembershipFindMany.mockResolvedValue([]);
    // Mock API key lookup for cache invalidation - return empty list
    mockApiKeyFindMany.mockResolvedValue([]);
  });

  describe("threshold detection", () => {
    it("detects first notification threshold crossing (50k)", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: 0 });

      const result = await processThresholds(org, 50_000);

      // Verify updateData contains WARNING state (even though no emails sent due to empty admin list)
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 50_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "WARNING",
        shouldInvalidateCache: false,
      });
    });

    it("detects second notification threshold crossing (100k)", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: 60_000 });

      const result = await processThresholds(org, 100_000);

      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 100_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "WARNING",
        shouldInvalidateCache: false,
      });
    });

    it("detects blocking threshold crossing (250k)", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: 150_000 });

      const result = await processThresholds(org, 250_000);

      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 250_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "BLOCKED",
        shouldInvalidateCache: true, // Blocking state changed
      });
    });

    it("does not trigger when usage below threshold", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: 0 });

      const result = await processThresholds(org, 40_000);

      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 40_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: null,
        shouldInvalidateCache: false,
      });
    });

    it("does not trigger when already past threshold", async () => {
      const org = createMockOrg({
        cloudCurrentCycleUsage: 60_000,
        cloudFreeTierUsageThresholdState: "WARNING", // Already in WARNING state
      });

      const result = await processThresholds(org, 70_000);

      // State-based: Should maintain WARNING state (above 50k threshold)
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 70_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "WARNING",
        shouldInvalidateCache: false,
      });
    });
  });

  describe("threshold boundary cases", () => {
    it("triggers exactly at threshold (50k)", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: 49_999 });

      const result = await processThresholds(org, 50_000);

      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 50_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "WARNING",
        shouldInvalidateCache: false,
      });
    });

    it("triggers exactly at threshold (100k)", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: 99_999 });

      const result = await processThresholds(org, 100_000);

      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 100_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "WARNING",
        shouldInvalidateCache: false,
      });
    });

    it("triggers exactly at threshold (250k)", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: 249_999 });

      const result = await processThresholds(org, 250_000);

      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 250_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "BLOCKED",
        shouldInvalidateCache: true,
      });
    });
  });

  describe("multiple threshold crossings", () => {
    it("crosses both notification thresholds in one run (0 -> 150k)", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: 0 });

      const result = await processThresholds(org, 150_000);

      // Should send notification for highest threshold (100k), not 50k
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 150_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "WARNING",
        shouldInvalidateCache: false,
      });
    });

    it("crosses all thresholds in one run (0 -> 250k)", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: 0 });

      const result = await processThresholds(org, 250_000);

      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 250_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "BLOCKED",
        shouldInvalidateCache: true,
      });
    });

    it("crosses from 50k to 250k (skips intermediate notifications)", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: 50_000 });

      const result = await processThresholds(org, 250_000);

      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 250_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "BLOCKED",
        shouldInvalidateCache: true,
      });
    });
  });

  describe("idempotency", () => {
    it("does not re-trigger notification for same usage level", async () => {
      const org = createMockOrg({
        cloudCurrentCycleUsage: 60_000,
        cloudFreeTierUsageThresholdState: "WARNING", // Already in WARNING state
      });

      // Already processed 60k (past 50k threshold), now at 70k (still below 100k)
      const result = await processThresholds(org, 70_000);

      // State-based: Should maintain WARNING state, not send email (no state transition)
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 70_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "WARNING",
        shouldInvalidateCache: false,
      });
    });

    it("does not re-trigger blocking for same usage level", async () => {
      const org = createMockOrg({
        cloudCurrentCycleUsage: 250_000,
        cloudFreeTierUsageThresholdState: "BLOCKED", // Already in BLOCKED state
      });

      // Already blocked at 250k, now at 260k
      const result = await processThresholds(org, 260_000);

      // State-based: Should maintain BLOCKED state, not send email (no state transition)
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 260_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "BLOCKED",
        shouldInvalidateCache: false,
      });
    });
  });

  describe("null/undefined lastUsage", () => {
    it("treats null cloudCurrentCycleUsage as 0", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: null });

      const result = await processThresholds(org, 50_000);

      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 50_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "WARNING",
        shouldInvalidateCache: false,
      });
    });

    it("treats undefined cloudCurrentCycleUsage as 0", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: undefined as any });

      const result = await processThresholds(org, 50_000);

      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 50_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "WARNING",
        shouldInvalidateCache: false,
      });
    });
  });

  describe("database updates", () => {
    it("updates cloudCurrentCycleUsage and cloudBillingCycleUpdatedAt", async () => {
      const org = createMockOrg({ cloudCurrentCycleUsage: 0 });
      const beforeTime = new Date();

      const result = await processThresholds(org, 30_000);

      const afterTime = new Date();

      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 30_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: null,
        shouldInvalidateCache: false,
      });

      const updatedAt = result.updateData.cloudBillingCycleUpdatedAt;

      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(updatedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe("enforcement feature flag", () => {
    it("tracks usage but does not enforce when LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED is false", async () => {
      // Temporarily set enforcement to disabled
      const originalEnv =
        process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED;
      process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED =
        "false";

      // Need to reload the module to pick up the new env var
      vi.resetModules();
      const { processThresholds: processThresholdsDisabled } = await import(
        "../ee/usageThresholds/thresholdProcessing"
      );

      const org = createMockOrg({ cloudCurrentCycleUsage: 0 });

      const result = await processThresholdsDisabled(org, 250_000);

      // Should track usage but not set state
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 250_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: null,
        shouldInvalidateCache: false,
      });

      // Should return ENFORCEMENT_DISABLED
      expect(result.actionTaken).toBe("ENFORCEMENT_DISABLED");
      expect(result.emailSent).toBe(false);
      expect(result.emailFailed).toBe(false);

      // Restore original env
      process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED =
        originalEnv;
      vi.resetModules();
    });

    it("clears state when enforcement is disabled and org was previously blocked", async () => {
      // Temporarily set enforcement to disabled
      const originalEnv =
        process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED;
      process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED =
        "false";

      // Need to reload the module to pick up the new env var
      vi.resetModules();
      const { processThresholds: processThresholdsDisabled } = await import(
        "../ee/usageThresholds/thresholdProcessing"
      );

      const org = createMockOrg({
        cloudCurrentCycleUsage: 250_000,
        cloudFreeTierUsageThresholdState: "BLOCKED",
      });

      const result = await processThresholdsDisabled(org, 260_000);

      // Should clear the state when enforcement is disabled
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 260_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: null,
        shouldInvalidateCache: false,
      });

      // Restore original env
      process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED =
        originalEnv;
      vi.resetModules();
    });

    it("enforces thresholds when LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED is true", async () => {
      // This is the default for all other tests, but let's be explicit
      const originalEnv =
        process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED;
      process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED =
        "true";

      vi.resetModules();
      const { processThresholds: processThresholdsEnabled } = await import(
        "../ee/usageThresholds/thresholdProcessing"
      );

      const org = createMockOrg({ cloudCurrentCycleUsage: 0 });

      const result = await processThresholdsEnabled(org, 250_000);

      // Should enforce and block
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 250_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: "BLOCKED",
        shouldInvalidateCache: true,
      });

      expect(result.actionTaken).toBe("BLOCKED");

      // Restore original env
      process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED =
        originalEnv;
      vi.resetModules();
    });

    it("skips enforcement for paid plan orgs regardless of enforcement flag", async () => {
      // Set enforcement to enabled
      const originalEnv =
        process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED;
      process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED =
        "true";

      vi.resetModules();
      const { processThresholds: processThresholdsEnabled } = await import(
        "../ee/usageThresholds/thresholdProcessing"
      );

      const org = createMockOrg({
        cloudCurrentCycleUsage: 0,
        cloudConfig: {
          stripe: {
            customerId: "cus_123",
            activeSubscriptionId: "sub_123",
            isLegacySubscription: false,
          },
        },
      });

      const result = await processThresholdsEnabled(org, 250_000);

      // Should not enforce for paid plan
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 250_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: null,
        shouldInvalidateCache: false,
      });

      expect(result.actionTaken).toBe("PAID_PLAN");
      expect(result.emailSent).toBe(false);

      // Restore original env
      process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED =
        originalEnv;
      vi.resetModules();
    });
  });

  describe("manual plan overrides", () => {
    it("skips enforcement for orgs with manual plan override (Hobby)", async () => {
      const org = createMockOrg({
        cloudCurrentCycleUsage: 0,
        cloudConfig: {
          plan: "Hobby",
        },
      });

      const result = await processThresholds(org, 250_000);

      // Should not enforce for manual plan override
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 250_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: null,
        shouldInvalidateCache: false,
      });

      expect(result.actionTaken).toBe("PAID_PLAN");
      expect(result.emailSent).toBe(false);
      expect(result.emailFailed).toBe(false);
    });

    it("skips enforcement for orgs with manual plan override (Team)", async () => {
      const org = createMockOrg({
        cloudCurrentCycleUsage: 0,
        cloudConfig: {
          plan: "Team",
        },
      });

      const result = await processThresholds(org, 250_000);

      // Should not enforce for manual plan override
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 250_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: null,
        shouldInvalidateCache: false,
      });

      expect(result.actionTaken).toBe("PAID_PLAN");
      expect(result.emailSent).toBe(false);
      expect(result.emailFailed).toBe(false);
    });

    it("skips enforcement for orgs with manual plan override (Enterprise)", async () => {
      const org = createMockOrg({
        cloudCurrentCycleUsage: 0,
        cloudConfig: {
          plan: "Enterprise",
        },
      });

      const result = await processThresholds(org, 250_000);

      // Should not enforce for manual plan override
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 250_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: null,
        shouldInvalidateCache: false,
      });

      expect(result.actionTaken).toBe("PAID_PLAN");
      expect(result.emailSent).toBe(false);
      expect(result.emailFailed).toBe(false);
    });

    it("does not send threshold emails to orgs with manual plan override at 50k", async () => {
      const org = createMockOrg({
        cloudCurrentCycleUsage: 0,
        cloudConfig: {
          plan: "Core",
        },
      });

      const result = await processThresholds(org, 50_000);

      // Should not send any notifications
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 50_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: null,
        shouldInvalidateCache: false,
      });

      expect(result.actionTaken).toBe("PAID_PLAN");
      expect(result.emailSent).toBe(false);
    });

    it("does not send threshold emails to orgs with manual plan override at 100k", async () => {
      const org = createMockOrg({
        cloudCurrentCycleUsage: 0,
        cloudConfig: {
          plan: "Pro",
        },
      });

      const result = await processThresholds(org, 100_000);

      // Should not send any notifications
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 100_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: null,
        shouldInvalidateCache: false,
      });

      expect(result.actionTaken).toBe("PAID_PLAN");
      expect(result.emailSent).toBe(false);
    });

    it("clears blocking state when org transitions to manual plan override", async () => {
      const org = createMockOrg({
        cloudCurrentCycleUsage: 250_000,
        cloudFreeTierUsageThresholdState: "BLOCKED",
        cloudConfig: {
          plan: "Team",
        },
      });

      const result = await processThresholds(org, 260_000);

      // Should clear the blocking state and invalidate cache
      expect(result.updateData).toEqual({
        orgId: "org-1",
        cloudCurrentCycleUsage: 260_000,
        cloudBillingCycleUpdatedAt: expect.any(Date),
        cloudFreeTierUsageThresholdState: null,
        shouldInvalidateCache: true,
      });

      expect(result.actionTaken).toBe("PAID_PLAN");
      expect(result.emailSent).toBe(false);
    });
  });
});
