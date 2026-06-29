import { CloudConfigSchema, type Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import type { ServerContext } from "../types";

export type McpPublicApiAuth = {
  validKey: true;
  scope: {
    projectId: string;
    orgId: string;
    apiKeyId: string;
    publicKey: string;
    accessLevel: "project";
    plan: Plan;
    rateLimitOverrides: [];
    isIngestionSuspended: false;
    isInAppAgentKey: boolean;
  };
};

export const getMcpPublicApiAuth = async (
  context: ServerContext,
): Promise<McpPublicApiAuth> => {
  const org = await prisma.organization.findUnique({
    where: { id: context.orgId },
    select: { cloudConfig: true },
  });

  const cloudConfig = org?.cloudConfig
    ? CloudConfigSchema.parse(org.cloudConfig)
    : undefined;

  return {
    validKey: true,
    scope: {
      projectId: context.projectId,
      orgId: context.orgId,
      apiKeyId: context.apiKeyId,
      publicKey: context.publicKey,
      accessLevel: "project",
      plan: getOrganizationPlanServerSide(cloudConfig),
      rateLimitOverrides: [],
      isIngestionSuspended: false,
      isInAppAgentKey: context.isInAppAgentKey === true,
    },
  };
};

export const paginationMeta = ({
  page,
  limit,
  totalItems,
}: {
  page: number;
  limit: number;
  totalItems: number;
}) => ({
  page,
  limit,
  totalItems,
  totalPages: Math.ceil(totalItems / limit),
});
