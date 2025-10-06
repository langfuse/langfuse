import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { type ParsedOrganization } from "@langfuse/shared";
import {
  redis,
  hashSecretKey,
  getDisplaySecretKey,
  createShaHash,
} from "@langfuse/shared/src/server";
import { processThresholds } from "../ee/usageThresholds/thresholdProcessing";
import { bulkUpdateOrganizations } from "../ee/usageThresholds/bulkUpdates";

// Enable enforcement feature flag for tests
vi.hoisted(() => {
  process.env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED = "true";
});

// SALT is defined in web env, not worker env
const SALT = process.env.SALT || "test-salt-for-hashing";

describe("Usage Threshold Cache Invalidation", () => {
  const testOrgId = "test-org-cache-invalidation";
  const testProjectId = "test-project-cache-invalidation";
  const testApiKeyId = "test-api-key-cache-invalidation";
  const testApiKeyPublic = "pk-lf-test-cache-inv";
  const testApiKeySecret = "sk-lf-test-cache-inv";

  beforeEach(async () => {
    // Clean up any existing test data
    await prisma.apiKey.deleteMany({
      where: { id: testApiKeyId },
    });
    await prisma.project.deleteMany({
      where: { id: testProjectId },
    });
    await prisma.organization.deleteMany({
      where: { id: testOrgId },
    });

    // Create test organization
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: "Test Org Cache Invalidation",
        cloudBillingCycleAnchor: new Date("2024-01-15T00:00:00Z"),
      },
    });

    // Create test project
    await prisma.project.create({
      data: {
        id: testProjectId,
        name: "Test Project Cache Invalidation",
        orgId: testOrgId,
      },
    });

    // Create test API key
    await prisma.apiKey.create({
      data: {
        id: testApiKeyId,
        publicKey: testApiKeyPublic,
        hashedSecretKey: await hashSecretKey(testApiKeySecret),
        displaySecretKey: getDisplaySecretKey(testApiKeySecret),
        projectId: testProjectId,
        note: "Test key for cache invalidation",
      },
    });

    // Clear Redis cache
    if (redis) {
      const keys = await redis.keys("api-key:*");
      if (keys.length > 0) {
        await redis.del(keys);
      }
    }
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.apiKey.deleteMany({
      where: { id: testApiKeyId },
    });
    await prisma.project.deleteMany({
      where: { id: testProjectId },
    });
    await prisma.organization.deleteMany({
      where: { id: testOrgId },
    });

    // Clear Redis cache
    if (redis) {
      const keys = await redis.keys("api-key:*");
      if (keys.length > 0) {
        await redis.del(keys);
      }
    }
  });

  it("should invalidate API key cache when org blocking state changes to BLOCKED", async () => {
    if (!redis) {
      console.log("Redis not available, skipping test");
      return;
    }

    // Step 1: Add API key to cache
    const fastHashedKey = createShaHash(testApiKeySecret, SALT);

    await prisma.apiKey.update({
      where: { id: testApiKeyId },
      data: { fastHashedSecretKey: fastHashedKey },
    });

    // Simulate cached API key in Redis
    const cachedApiKey = {
      id: testApiKeyId,
      publicKey: testApiKeyPublic,
      hashedSecretKey: await hashSecretKey(testApiKeySecret),
      fastHashedSecretKey: fastHashedKey,
      displaySecretKey: getDisplaySecretKey(testApiKeySecret),
      note: "Test key",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      projectId: testProjectId,
      orgId: testOrgId,
      plan: "cloud:hobby",
      scope: "PROJECT",
      rateLimitOverrides: null,
      isIngestionSuspended: false,
    };

    await redis.set(
      `api-key:${fastHashedKey}`,
      JSON.stringify(cachedApiKey),
      "EX",
      3600,
    );

    // Verify key is in cache
    const cachedBefore = await redis.get(`api-key:${fastHashedKey}`);
    expect(cachedBefore).not.toBeNull();

    // Step 2: Trigger threshold processing that blocks the org (250k threshold)
    const org: ParsedOrganization = {
      id: testOrgId,
      name: "Test Org",
      cloudConfig: null,
      metadata: null,
      cloudBillingCycleAnchor: new Date("2024-01-15T00:00:00Z"),
      cloudBillingCycleUpdatedAt: null,
      cloudCurrentCycleUsage: 150_000, // Below blocking threshold
      cloudFreeTierUsageThresholdState: null, // Not blocked yet
      aiFeaturesEnabled: false,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
    };

    const result = await processThresholds(org, 250_000); // Cross blocking threshold

    // Execute bulk update to complete the process (including cache invalidation)
    await bulkUpdateOrganizations([result.updateData]);

    // Step 3: Verify cache was invalidated
    const cachedAfter = await redis.get(`api-key:${fastHashedKey}`);
    expect(cachedAfter).toBeNull();

    // Step 4: Verify org state was updated
    const updatedOrg = await prisma.organization.findUnique({
      where: { id: testOrgId },
    });
    expect(updatedOrg?.cloudFreeTierUsageThresholdState).toBe("BLOCKED");
  });

  it("should invalidate API key cache when org blocking state changes from BLOCKED to null", async () => {
    if (!redis) {
      console.log("Redis not available, skipping test");
      return;
    }

    // Step 1: Set org to BLOCKED state
    await prisma.organization.update({
      where: { id: testOrgId },
      data: {
        cloudFreeTierUsageThresholdState: "BLOCKED",
        cloudCurrentCycleUsage: 250_000,
      },
    });

    // Step 2: Add API key to cache with isIngestionSuspended = true
    const fastHashedKey = createShaHash(testApiKeySecret, SALT);

    await prisma.apiKey.update({
      where: { id: testApiKeyId },
      data: { fastHashedSecretKey: fastHashedKey },
    });

    const cachedApiKey = {
      id: testApiKeyId,
      publicKey: testApiKeyPublic,
      hashedSecretKey: await hashSecretKey(testApiKeySecret),
      fastHashedSecretKey: fastHashedKey,
      displaySecretKey: getDisplaySecretKey(testApiKeySecret),
      note: "Test key",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      projectId: testProjectId,
      orgId: testOrgId,
      plan: "cloud:hobby",
      scope: "PROJECT",
      rateLimitOverrides: null,
      isIngestionSuspended: true, // Blocked
    };

    await redis.set(
      `api-key:${fastHashedKey}`,
      JSON.stringify(cachedApiKey),
      "EX",
      3600,
    );

    // Verify key is in cache
    const cachedBefore = await redis.get(`api-key:${fastHashedKey}`);
    expect(cachedBefore).not.toBeNull();

    // Step 3: Simulate org moving to paid plan (usage still high but now allowed)
    await prisma.organization.update({
      where: { id: testOrgId },
      data: {
        cloudConfig: {
          stripe: {
            customerId: "cus_test",
            activeSubscriptionId: "sub_test",
            activeProductId: "prod_test",
          },
        },
      },
    });

    // Trigger threshold processing (paid plan = no blocking)
    const org: ParsedOrganization = {
      id: testOrgId,
      name: "Test Org",
      cloudConfig: {
        stripe: {
          customerId: "cus_test",
          activeSubscriptionId: "sub_test",
          activeProductId: "prod_test",
          isLegacySubscription: false,
        },
      },
      metadata: null,
      cloudBillingCycleAnchor: new Date("2024-01-15T00:00:00Z"),
      cloudBillingCycleUpdatedAt: new Date(),
      cloudCurrentCycleUsage: 250_000,
      cloudFreeTierUsageThresholdState: "BLOCKED", // Previously blocked
      aiFeaturesEnabled: false,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
    };

    const result = await processThresholds(org, 300_000); // Still high usage but paid plan

    // Execute bulk update to complete the process (including cache invalidation)
    await bulkUpdateOrganizations([result.updateData]);

    // Step 4: Verify cache was invalidated
    const cachedAfter = await redis.get(`api-key:${fastHashedKey}`);
    expect(cachedAfter).toBeNull();

    // Step 5: Verify org state was updated to unblocked
    const updatedOrg = await prisma.organization.findUnique({
      where: { id: testOrgId },
    });
    expect(updatedOrg?.cloudFreeTierUsageThresholdState).toBeNull();
  });

  it("should NOT invalidate cache when state does not change", async () => {
    if (!redis) {
      console.log("Redis not available, skipping test");
      return;
    }

    // Step 1: Add API key to cache
    const fastHashedKey = createShaHash(testApiKeySecret, SALT);

    await prisma.apiKey.update({
      where: { id: testApiKeyId },
      data: { fastHashedSecretKey: fastHashedKey },
    });

    const cachedApiKey = {
      id: testApiKeyId,
      publicKey: testApiKeyPublic,
      hashedSecretKey: await hashSecretKey(testApiKeySecret),
      fastHashedSecretKey: fastHashedKey,
      displaySecretKey: getDisplaySecretKey(testApiKeySecret),
      note: "Test key",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      projectId: testProjectId,
      orgId: testOrgId,
      plan: "cloud:hobby",
      scope: "PROJECT",
      rateLimitOverrides: null,
      isIngestionSuspended: false,
    };

    await redis.set(
      `api-key:${fastHashedKey}`,
      JSON.stringify(cachedApiKey),
      "EX",
      3600,
    );

    // Verify key is in cache
    const cachedBefore = await redis.get(`api-key:${fastHashedKey}`);
    expect(cachedBefore).not.toBeNull();

    // Step 2: Trigger threshold processing with usage that doesn't cross thresholds
    const org: ParsedOrganization = {
      id: testOrgId,
      name: "Test Org",
      cloudConfig: null,
      metadata: null,
      cloudBillingCycleAnchor: new Date("2024-01-15T00:00:00Z"),
      cloudBillingCycleUpdatedAt: null,
      cloudCurrentCycleUsage: 30_000,
      cloudFreeTierUsageThresholdState: null,
      aiFeaturesEnabled: false,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
    };

    const result = await processThresholds(org, 40_000); // Still below thresholds

    // Execute bulk update to complete the process
    await bulkUpdateOrganizations([result.updateData]);

    // Step 3: Verify cache was NOT invalidated (state didn't change)
    const cachedAfter = await redis.get(`api-key:${fastHashedKey}`);
    expect(cachedAfter).not.toBeNull();
    expect(cachedAfter).toBe(cachedBefore);
  });

  it("should handle multiple API keys for same org", async () => {
    if (!redis) {
      console.log("Redis not available, skipping test");
      return;
    }

    // Create second API key
    const testApiKeyId2 = "test-api-key-cache-inv-2";
    const testApiKeyPublic2 = "pk-lf-test-cache-inv-2";
    const testApiKeySecret2 = "sk-lf-test-cache-inv-2";

    await prisma.apiKey.create({
      data: {
        id: testApiKeyId2,
        publicKey: testApiKeyPublic2,
        hashedSecretKey: await hashSecretKey(testApiKeySecret2),
        displaySecretKey: getDisplaySecretKey(testApiKeySecret2),
        projectId: testProjectId,
        note: "Test key 2",
      },
    });

    // Add both keys to cache
    const fastHashedKey1 = createShaHash(testApiKeySecret, SALT);
    const fastHashedKey2 = createShaHash(testApiKeySecret2, SALT);

    await prisma.apiKey.update({
      where: { id: testApiKeyId },
      data: { fastHashedSecretKey: fastHashedKey1 },
    });

    await prisma.apiKey.update({
      where: { id: testApiKeyId2 },
      data: { fastHashedSecretKey: fastHashedKey2 },
    });

    const cachedApiKey1 = {
      id: testApiKeyId,
      publicKey: testApiKeyPublic,
      hashedSecretKey: await hashSecretKey(testApiKeySecret),
      fastHashedSecretKey: fastHashedKey1,
      displaySecretKey: getDisplaySecretKey(testApiKeySecret),
      note: "Test key 1",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      projectId: testProjectId,
      orgId: testOrgId,
      plan: "cloud:hobby",
      scope: "PROJECT",
      rateLimitOverrides: null,
      isIngestionSuspended: false,
    };

    const cachedApiKey2 = {
      id: testApiKeyId2,
      publicKey: testApiKeyPublic2,
      hashedSecretKey: await hashSecretKey(testApiKeySecret2),
      fastHashedSecretKey: fastHashedKey2,
      displaySecretKey: getDisplaySecretKey(testApiKeySecret2),
      note: "Test key 2",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      projectId: testProjectId,
      orgId: testOrgId,
      plan: "cloud:hobby",
      scope: "PROJECT",
      rateLimitOverrides: null,
      isIngestionSuspended: false,
    };

    await redis.set(
      `api-key:${fastHashedKey1}`,
      JSON.stringify(cachedApiKey1),
      "EX",
      3600,
    );

    await redis.set(
      `api-key:${fastHashedKey2}`,
      JSON.stringify(cachedApiKey2),
      "EX",
      3600,
    );

    // Verify both keys are in cache
    expect(await redis.get(`api-key:${fastHashedKey1}`)).not.toBeNull();
    expect(await redis.get(`api-key:${fastHashedKey2}`)).not.toBeNull();

    // Trigger blocking
    const org: ParsedOrganization = {
      id: testOrgId,
      name: "Test Org",
      cloudConfig: null,
      metadata: null,
      cloudBillingCycleAnchor: new Date("2024-01-15T00:00:00Z"),
      cloudBillingCycleUpdatedAt: null,
      cloudCurrentCycleUsage: 150_000,
      cloudFreeTierUsageThresholdState: null,
      aiFeaturesEnabled: false,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
    };

    const result = await processThresholds(org, 250_000);

    // Execute bulk update to complete the process (including cache invalidation)
    await bulkUpdateOrganizations([result.updateData]);

    // Verify both keys were invalidated
    expect(await redis.get(`api-key:${fastHashedKey1}`)).toBeNull();
    expect(await redis.get(`api-key:${fastHashedKey2}`)).toBeNull();

    // Clean up second key
    await prisma.apiKey.delete({
      where: { id: testApiKeyId2 },
    });
  });
});
