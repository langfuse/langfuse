import { describe, it, expect, beforeEach, vi } from "vitest";
import { type Mock } from "vitest";

// Hoist environment variable setting to ensure it happens before module initialization
vi.hoisted(() => {
  process.env.LANGFUSE_USAGE_THRESHOLD_ENFORCEMENT_ENABLED = "true";
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
  billingCycleAnchor: new Date("2024-01-15T00:00:00Z"),
  billingCycleLastUpdatedAt: null,
  billingCycleLastUsage: null,
  billingCycleUsageState: null,
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
      const org = createMockOrg({ billingCycleLastUsage: 0 });

      await processThresholds(org, 50_000);

      // Verify update was called with WARNING state (even though no emails sent due to empty admin list)
      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 50_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: "WARNING",
        },
      });
    });

    it("detects second notification threshold crossing (100k)", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 60_000 });

      await processThresholds(org, 100_000);

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 100_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: "WARNING",
        },
      });
    });

    it("detects blocking threshold crossing (200k)", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 150_000 });

      await processThresholds(org, 200_000);

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 200_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: "BLOCKED",
        },
      });
    });

    it("does not trigger when usage below threshold", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 0 });

      await processThresholds(org, 40_000);

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 40_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: null,
        },
      });
    });

    it("does not trigger when already past threshold", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 60_000 });

      await processThresholds(org, 70_000);

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 70_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: null,
        },
      });
    });
  });

  describe("threshold boundary cases", () => {
    it("triggers exactly at threshold (50k)", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 49_999 });

      await processThresholds(org, 50_000);

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 50_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: "WARNING",
        },
      });
    });

    it("triggers exactly at threshold (100k)", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 99_999 });

      await processThresholds(org, 100_000);

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 100_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: "WARNING",
        },
      });
    });

    it("triggers exactly at threshold (200k)", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 199_999 });

      await processThresholds(org, 200_000);

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 200_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: "BLOCKED",
        },
      });
    });
  });

  describe("multiple threshold crossings", () => {
    it("crosses both notification thresholds in one run (0 -> 150k)", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 0 });

      await processThresholds(org, 150_000);

      // Should send notification for highest threshold (100k), not 50k
      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 150_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: "WARNING",
        },
      });
    });

    it("crosses all thresholds in one run (0 -> 250k)", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 0 });

      await processThresholds(org, 250_000);

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 250_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: "BLOCKED",
        },
      });
    });

    it("crosses from 50k to 200k (skips 100k notification)", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 50_000 });

      await processThresholds(org, 200_000);

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 200_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: "BLOCKED",
        },
      });
    });
  });

  describe("idempotency", () => {
    it("does not re-trigger notification for same usage level", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 60_000 });

      // Already processed 60k (past 50k threshold), now at 70k (still below 100k)
      await processThresholds(org, 70_000);

      // Should only update usage, not send email
      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 70_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: null,
        },
      });
    });

    it("does not re-trigger blocking for same usage level", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 200_000 });

      // Already blocked at 200k, now at 210k
      await processThresholds(org, 210_000);

      // Should only update usage, not re-block
      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 210_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: null,
        },
      });
    });
  });

  describe("null/undefined lastUsage", () => {
    it("treats null billingCycleLastUsage as 0", async () => {
      const org = createMockOrg({ billingCycleLastUsage: null });

      await processThresholds(org, 50_000);

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 50_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: "WARNING",
        },
      });
    });

    it("treats undefined billingCycleLastUsage as 0", async () => {
      const org = createMockOrg({ billingCycleLastUsage: undefined as any });

      await processThresholds(org, 50_000);

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 50_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: "WARNING",
        },
      });
    });
  });

  describe("database updates", () => {
    it("updates billingCycleLastUsage and billingCycleLastUpdatedAt", async () => {
      const org = createMockOrg({ billingCycleLastUsage: 0 });
      const beforeTime = new Date();

      await processThresholds(org, 30_000);

      const afterTime = new Date();

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          billingCycleLastUsage: 30_000,
          billingCycleLastUpdatedAt: expect.any(Date),
          billingCycleUsageState: null,
        },
      });

      const updateCall = mockOrgUpdate.mock.calls[0][0];
      const updatedAt = updateCall.data.billingCycleLastUpdatedAt as Date;

      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(updatedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });
});
