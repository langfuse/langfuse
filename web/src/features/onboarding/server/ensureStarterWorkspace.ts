import { Prisma, type PrismaClient } from "@prisma/client";
import { Role } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { env } from "@/src/env.mjs";
import { shouldAutoEnableV4 } from "@/src/features/events/lib/v4Rollout";

const DEFAULT_STARTER_ORGANIZATION_NAME = "My Organization";
const DEFAULT_STARTER_PROJECT_NAME = "My Project";
const MAX_TRANSACTION_RETRIES = 2;

export type EnsureStarterWorkspaceResult = {
  organizationId: string | null;
  starterOrganizationId: string | null;
  starterProjectId: string | null;
};

export async function ensureStarterWorkspace(params: {
  prisma: PrismaClient;
  userId: string;
  canCreateOrganizations: boolean;
}): Promise<EnsureStarterWorkspaceResult> {
  const isCloudDeployment = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

  const runEnsureStarterWorkspace = async () =>
    params.prisma.$transaction(
      async (tx) => {
        const existingNonDemoMemberships =
          await tx.organizationMembership.findMany({
            where: {
              userId: params.userId,
              ...(env.NEXT_PUBLIC_DEMO_ORG_ID
                ? { orgId: { not: env.NEXT_PUBLIC_DEMO_ORG_ID } }
                : {}),
            },
            select: {
              orgId: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          });

        let organizationId = existingNonDemoMemberships[0]?.orgId ?? null;
        let starterOrganizationId: string | null = null;
        let starterProjectId: string | null = null;

        if (
          existingNonDemoMemberships.length === 0 &&
          params.canCreateOrganizations
        ) {
          const organization = await tx.organization.create({
            data: {
              name: DEFAULT_STARTER_ORGANIZATION_NAME,
              organizationMemberships: {
                create: {
                  userId: params.userId,
                  role: Role.OWNER,
                },
              },
            },
          });

          const project = await tx.project.create({
            data: {
              name: DEFAULT_STARTER_PROJECT_NAME,
              orgId: organization.id,
            },
          });

          organizationId = organization.id;
          starterOrganizationId = organization.id;
          starterProjectId = project.id;

          if (isCloudDeployment) {
            const userRolloutState = await tx.user.findUnique({
              where: { id: params.userId },
              select: {
                createdAt: true,
                v4BetaEnabled: true,
                organizationMemberships: {
                  select: {
                    organization: {
                      select: {
                        id: true,
                        createdAt: true,
                      },
                    },
                  },
                },
              },
            });

            if (
              userRolloutState &&
              !userRolloutState.v4BetaEnabled &&
              shouldAutoEnableV4({
                userCreatedAt: userRolloutState.createdAt,
                organizations: userRolloutState.organizationMemberships.map(
                  (membership) => ({
                    id: membership.organization.id,
                    createdAt: membership.organization.createdAt,
                  }),
                ),
                excludedOrganizationIds: env.NEXT_PUBLIC_DEMO_ORG_ID
                  ? [env.NEXT_PUBLIC_DEMO_ORG_ID]
                  : [],
              })
            ) {
              await tx.user.update({
                where: { id: params.userId },
                data: { v4BetaEnabled: true },
              });
            }
          }
        }

        return {
          organizationId,
          starterOrganizationId,
          starterProjectId,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

  let result: EnsureStarterWorkspaceResult | null = null;

  for (let attempt = 0; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
    try {
      result = await runEnsureStarterWorkspace();
      break;
    } catch (error) {
      const isSerializationFailure =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";

      if (isSerializationFailure && attempt < MAX_TRANSACTION_RETRIES) {
        continue;
      }

      throw error;
    }
  }

  if (!result) {
    throw new Error("Failed to ensure starter workspace");
  }

  if (result.starterOrganizationId && result.starterProjectId) {
    await auditLog({
      resourceType: "organization",
      resourceId: result.starterOrganizationId,
      action: "create",
      userId: params.userId,
      orgId: result.starterOrganizationId,
      orgRole: Role.OWNER,
      after: {
        id: result.starterOrganizationId,
        name: DEFAULT_STARTER_ORGANIZATION_NAME,
      },
    });

    await auditLog({
      resourceType: "project",
      resourceId: result.starterProjectId,
      action: "create",
      userId: params.userId,
      orgId: result.starterOrganizationId,
      orgRole: Role.OWNER,
      projectId: result.starterProjectId,
      projectRole: Role.OWNER,
      after: {
        id: result.starterProjectId,
        name: DEFAULT_STARTER_PROJECT_NAME,
        orgId: result.starterOrganizationId,
      },
    });
  }

  return result;
}
