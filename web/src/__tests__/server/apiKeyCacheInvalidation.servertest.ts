import { type Plan, Role } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  createApiKeyCacheKey,
  createAuthzContextCacheKey,
  createShaHash,
} from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// organizations.delete cancels Stripe before deleting; the test env has a cloud
// region but no Stripe, so force the self-hosted path to reach the eviction.
vi.mock("@/src/ee/features/billing/utils/isCloudBilling", () => ({
  isCloudBillingEnabled: () => false,
  useIsCloudBillingAvailable: () => false,
}));

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";
import { handleDeleteProject } from "@/src/ee/features/admin-api/server/projects/projectById";
import { handleDeleteOrganization } from "@/src/ee/features/admin-api/server/organizations/organizationById";
import {
  createRedisTestClient,
  ensureRedisReady,
  getRedisKeysByPattern,
  setRedisValue,
  type RedisTestClient,
} from "@/src/__tests__/server/redis-test-utils";

let redis: RedisTestClient;

beforeAll(async () => {
  redis = createRedisTestClient();
  await ensureRedisReady(redis);
});

afterAll(() => {
  redis.disconnect();
});

async function createOrg() {
  const orgId = uuidv4();
  await prisma.organization.create({
    data: { id: orgId, name: `Org ${orgId.slice(0, 8)}` },
  });
  return orgId;
}

async function createProject(orgId: string) {
  const projectId = uuidv4();
  await prisma.project.create({
    data: { id: projectId, name: `Project ${projectId.slice(0, 8)}`, orgId },
  });
  return projectId;
}

function cacheKeysFor({
  fastHash,
  publicKey,
}: {
  fastHash: string;
  publicKey: string;
}) {
  return [
    createApiKeyCacheKey(fastHash),
    createAuthzContextCacheKey(fastHash),
    createAuthzContextCacheKey(createShaHash(publicKey, env.SALT!)),
  ];
}

async function seedOrgScopedKey(orgId: string) {
  const suffix = uuidv4().slice(0, 8);
  const fastHash = `fh-${suffix}`;
  const publicKey = `pk-lf-${suffix}`;
  await prisma.apiKey.create({
    data: {
      orgId,
      scope: "ORGANIZATION",
      publicKey,
      hashedSecretKey: `hsk-${suffix}`,
      fastHashedSecretKey: fastHash,
      displaySecretKey: `sk-...${suffix}`,
    },
  });
  const keys = cacheKeysFor({ fastHash, publicKey });
  for (const key of keys) {
    await setRedisValue(redis, key, "1");
  }
  return keys;
}

async function survivingKeys(keys: string[]) {
  const present: string[] = [];
  for (const key of keys) {
    const [hit] = await getRedisKeysByPattern(redis, key);
    if (hit) present.push(hit);
  }
  return present;
}

async function createUserInOrgs(orgIds: string[]) {
  const userId = uuidv4();
  const user = await prisma.user.create({
    data: {
      id: userId,
      email: `cache-inval-${userId.slice(0, 8)}@test.com`,
      name: "Test User",
    },
  });
  for (const orgId of orgIds) {
    await prisma.organizationMembership.create({
      data: { userId: user.id, orgId, role: Role.OWNER },
    });
  }
  return user;
}

function makeCaller({
  userId,
  orgIds,
  projectId,
  plan = "cloud:pro",
}: {
  userId: string;
  orgIds: string[];
  projectId?: string;
  plan?: Plan;
}) {
  const session: Session = {
    expires: "1",
    user: {
      id: userId,
      canCreateOrganizations: true,
      name: "Test User",
      email: "cache-inval@test.com",
      organizations: orgIds.map((orgId) => ({
        id: orgId,
        name: "Test Organization",
        role: Role.OWNER,
        plan,
        cloudConfig: undefined,
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: true,
        projects: projectId
          ? [
              {
                id: projectId,
                role: Role.OWNER,
                retentionDays: 0,
                deletedAt: null,
                hasTraces: false,
                name: "Test Project",
                metadata: {},
                createdAt: new Date().toISOString(),
              },
            ]
          : [],
      })),
      featureFlags: {
        searchBar: false,
        excludeClickhouseRead: false,
        templateFlag: true,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
      admin: false,
    },
    environment: {} as any,
  };
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma, session });
}

function makeRes() {
  const res: any = {};
  res.statusCode = 200;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res;
}

describe("API-key cache invalidation on project/org lifecycle", () => {
  beforeEach(async () => {
    await ensureRedisReady(redis);
  });

  it("projects.delete evicts the org's cached keys", async () => {
    const orgId = await createOrg();
    const projectId = await createProject(orgId);
    const user = await createUserInOrgs([orgId]);
    const keys = await seedOrgScopedKey(orgId);

    const caller = makeCaller({ userId: user.id, orgIds: [orgId], projectId });
    await caller.projects.delete({ projectId });

    expect(await survivingKeys(keys)).toEqual([]);
  });

  it("projects.transfer evicts cached keys for both source and target orgs", async () => {
    const sourceOrgId = await createOrg();
    const targetOrgId = await createOrg();
    const projectId = await createProject(sourceOrgId);
    const user = await createUserInOrgs([sourceOrgId, targetOrgId]);
    const sourceKeys = await seedOrgScopedKey(sourceOrgId);
    const targetKeys = await seedOrgScopedKey(targetOrgId);

    const caller = makeCaller({
      userId: user.id,
      orgIds: [sourceOrgId, targetOrgId],
      projectId,
    });
    await caller.projects.transfer({ projectId, targetOrgId });

    expect(await survivingKeys([...sourceKeys, ...targetKeys])).toEqual([]);
  });

  it("organizations.delete evicts cached keys before the cascade removes the rows", async () => {
    const orgId = await createOrg();
    const user = await createUserInOrgs([orgId]);
    const keys = await seedOrgScopedKey(orgId);

    const caller = makeCaller({ userId: user.id, orgIds: [orgId] });
    await caller.organizations.delete({ orgId });

    expect(await survivingKeys(keys)).toEqual([]);
  });

  it("admin handleDeleteProject evicts the org's cached keys", async () => {
    const orgId = await createOrg();
    const projectId = await createProject(orgId);
    const keys = await seedOrgScopedKey(orgId);

    const res = makeRes();
    await handleDeleteProject({} as any, res, projectId, {
      orgId,
      apiKeyId: "ADMIN_KEY",
    } as any);

    expect(res.statusCode).toBe(202);
    expect(await survivingKeys(keys)).toEqual([]);
  });

  it("admin handleDeleteOrganization evicts cached keys before the cascade removes the rows", async () => {
    const orgId = await createOrg();
    const keys = await seedOrgScopedKey(orgId);

    const res = makeRes();
    await handleDeleteOrganization(
      { query: { organizationId: orgId } } as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(await survivingKeys(keys)).toEqual([]);
  });
});
