import {
  LangfuseNotFoundError,
  Prisma,
  type PrismaClient,
  Role,
} from "@langfuse/shared";

import {
  featurePreviewFlags,
  type FeaturePreviewFlag,
} from "@/src/features/feature-flags/available-flags";
import {
  getFeaturePreviewOptOutFlag,
  parseFlags,
  parseFlagsWithOrganizationDefaults,
} from "@/src/features/feature-flags/utils";

export type FeaturePreviewManagementCapability = {
  allowed: boolean;
};

export type OrganizationFeaturePreviewStates = Record<
  FeaturePreviewFlag,
  boolean
>;

export const EMPTY_ORGANIZATION_FEATURE_PREVIEW_STATES = Object.fromEntries(
  featurePreviewFlags.map((flag) => [flag, false]),
) as OrganizationFeaturePreviewStates;

const MAX_SERIALIZABLE_ATTEMPTS = 3;

const isOrganizationManageableFeaturePreviewFlag = (
  flag: string,
): flag is FeaturePreviewFlag =>
  featurePreviewFlags.some((previewFlag) => previewFlag === flag);

export const filterOrganizationManageableFeaturePreviewFlags = (
  flags: string[],
): FeaturePreviewFlag[] =>
  flags.filter(isOrganizationManageableFeaturePreviewFlag);

const pickOrganizationFeaturePreviewStates = (
  flags: ReturnType<typeof parseFlags>,
): OrganizationFeaturePreviewStates =>
  Object.fromEntries(
    featurePreviewFlags.map((flag) => [flag, flags[flag] === true]),
  ) as OrganizationFeaturePreviewStates;

export async function getOrganizationFeaturePreviewStatesByUserId({
  prisma,
  userIds,
  organizationDefaults,
}: {
  prisma: Pick<PrismaClient, "user">;
  userIds: string[];
  organizationDefaults: string[];
}): Promise<Map<string, OrganizationFeaturePreviewStates>> {
  if (userIds.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      email: true,
      featureFlags: true,
      v4BetaEnabled: true,
    },
  });

  return new Map(
    users.map((user) => [
      user.id,
      pickOrganizationFeaturePreviewStates(
        parseFlagsWithOrganizationDefaults(
          user.featureFlags,
          organizationDefaults,
          {
            email: user.email,
            v4BetaEnabled: user.v4BetaEnabled,
          },
        ),
      ),
    ]),
  );
}

export async function getUserFeaturePreviewManagementCapabilities({
  prisma,
  actorUserId,
  actorIsPlatformAdmin,
  targetUserIds,
  demoOrgId,
}: {
  prisma: Pick<PrismaClient, "organizationMembership">;
  actorUserId: string;
  actorIsPlatformAdmin: boolean;
  targetUserIds: string[];
  demoOrgId?: string;
}): Promise<Map<string, FeaturePreviewManagementCapability>> {
  const uniqueTargetUserIds = [...new Set(targetUserIds)];
  if (actorIsPlatformAdmin) {
    return new Map(
      uniqueTargetUserIds.map((userId) => [
        userId,
        {
          allowed: true,
        } satisfies FeaturePreviewManagementCapability,
      ]),
    );
  }

  const targetMemberships = await prisma.organizationMembership.findMany({
    where: {
      userId: { in: uniqueTargetUserIds },
      ...(demoOrgId ? { orgId: { not: demoOrgId } } : {}),
    },
    select: { userId: true, orgId: true },
  });
  const targetOrgIds = [
    ...new Set(targetMemberships.map((membership) => membership.orgId)),
  ];
  const actorAdminMemberships =
    targetOrgIds.length === 0
      ? []
      : await prisma.organizationMembership.findMany({
          where: {
            userId: actorUserId,
            orgId: { in: targetOrgIds },
            role: { in: [Role.OWNER, Role.ADMIN] },
          },
          select: { orgId: true },
        });
  const actorAdminOrgIds = new Set(
    actorAdminMemberships.map((membership) => membership.orgId),
  );
  const targetOrgIdsByUser = new Map<string, Set<string>>();
  for (const membership of targetMemberships) {
    const orgIds = targetOrgIdsByUser.get(membership.userId) ?? new Set();
    orgIds.add(membership.orgId);
    targetOrgIdsByUser.set(membership.userId, orgIds);
  }

  return new Map(
    uniqueTargetUserIds.map((userId) => {
      const targetOrganizations = targetOrgIdsByUser.get(userId) ?? new Set();
      const allowed = [...targetOrganizations].every((orgId) =>
        actorAdminOrgIds.has(orgId),
      );
      return [
        userId,
        {
          allowed,
        } satisfies FeaturePreviewManagementCapability,
      ];
    }),
  );
}

export async function setUserFeaturePreviewInTransaction({
  tx,
  userId,
  flag,
  enabled,
}: {
  tx: Prisma.TransactionClient;
  userId: string;
  flag: FeaturePreviewFlag;
  enabled: boolean;
}): Promise<{ before: boolean; after: boolean }> {
  const rows = await tx.$queryRaw<
    Array<{
      email: string | null;
      featureFlags: string[];
      v4BetaEnabled: boolean;
    }>
  >`
    SELECT
      email,
      feature_flags AS "featureFlags",
      v4_beta_enabled AS "v4BetaEnabled"
    FROM users
    WHERE id = ${userId}
    FOR UPDATE
  `;
  const user = rows[0];
  if (!user) throw new LangfuseNotFoundError("User not found");

  const optOutFlag = getFeaturePreviewOptOutFlag(flag);
  const nextFeatureFlags = user.featureFlags.filter(
    (currentFlag) => currentFlag !== flag && currentFlag !== optOutFlag,
  );
  if (enabled) {
    nextFeatureFlags.push(flag);
  } else {
    nextFeatureFlags.push(optOutFlag);
  }

  const before =
    parseFlags(user.featureFlags, {
      email: user.email,
      v4BetaEnabled: user.v4BetaEnabled,
    })[flag] === true;
  const after =
    parseFlags(nextFeatureFlags, {
      email: user.email,
      v4BetaEnabled: user.v4BetaEnabled,
    })[flag] === true;

  if (
    user.featureFlags.length !== nextFeatureFlags.length ||
    user.featureFlags.some(
      (currentFlag, index) => currentFlag !== nextFeatureFlags[index],
    )
  ) {
    await tx.user.update({
      where: { id: userId },
      data: { featureFlags: { set: nextFeatureFlags } },
    });
  }

  return { before, after };
}

export async function setUserFeaturePreview({
  prisma,
  userId,
  flag,
  enabled,
}: {
  prisma: PrismaClient;
  userId: string;
  flag: FeaturePreviewFlag;
  enabled: boolean;
}): Promise<{ before: boolean; after: boolean }> {
  return withSerializableRetry(prisma, (tx) =>
    setUserFeaturePreviewInTransaction({ tx, userId, flag, enabled }),
  );
}

export async function setUserFeaturePreviewWithAuthorization({
  prisma,
  actorUserId,
  actorIsPlatformAdmin,
  currentOrgId,
  targetUserId,
  flag,
  enabled,
  demoOrgId,
}: {
  prisma: PrismaClient;
  actorUserId: string;
  actorIsPlatformAdmin: boolean;
  currentOrgId: string;
  targetUserId: string;
  flag: FeaturePreviewFlag;
  enabled: boolean;
  demoOrgId?: string;
}): Promise<
  | {
      membershipId: string;
      before: boolean;
      after: boolean;
    }
  | undefined
> {
  return withSerializableRetry(prisma, async (tx) => {
    const targetMembership = await tx.organizationMembership.findUnique({
      where: {
        orgId_userId: {
          orgId: currentOrgId,
          userId: targetUserId,
        },
      },
      select: { id: true },
    });
    if (!targetMembership) return undefined;

    const management = await getUserFeaturePreviewManagementCapabilities({
      prisma: tx,
      actorUserId,
      actorIsPlatformAdmin,
      targetUserIds: [targetUserId],
      demoOrgId,
    });
    if (!management.get(targetUserId)?.allowed) return undefined;

    const result = await setUserFeaturePreviewInTransaction({
      tx,
      userId: targetUserId,
      flag,
      enabled,
    });
    return {
      membershipId: targetMembership.id,
      ...result,
    };
  });
}

export async function setOrganizationFeatureFlagDefault({
  prisma,
  orgId,
  flag,
  enabled,
}: {
  prisma: PrismaClient;
  orgId: string;
  flag: FeaturePreviewFlag;
  enabled: boolean;
}): Promise<{
  before: FeaturePreviewFlag[];
  after: FeaturePreviewFlag[];
}> {
  return withSerializableRetry(prisma, async (tx) => {
    const organization = await tx.organization.findUnique({
      where: { id: orgId },
      select: { featureFlagOrgDefaults: true },
    });
    if (!organization) {
      throw new LangfuseNotFoundError("Organization not found");
    }

    const before = filterOrganizationManageableFeaturePreviewFlags(
      organization.featureFlagOrgDefaults,
    );
    const nextStoredDefaults = organization.featureFlagOrgDefaults.filter(
      (currentFlag) => currentFlag !== flag,
    );
    if (enabled) nextStoredDefaults.push(flag);
    const after =
      filterOrganizationManageableFeaturePreviewFlags(nextStoredDefaults);

    await tx.organization.update({
      where: { id: orgId },
      data: { featureFlagOrgDefaults: { set: nextStoredDefaults } },
    });

    return {
      before,
      after,
    };
  });
}

async function withSerializableRetry<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < MAX_SERIALIZABLE_ATTEMPTS
        )
      ) {
        throw error;
      }
    }
  }

  throw new Error("Serializable transaction retry exhausted");
}
