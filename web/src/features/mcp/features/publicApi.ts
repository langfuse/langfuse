import { CloudConfigSchema, type Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";
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

export const runPublicApiTool = async <TResult>({
  spanName,
  context,
  attributes,
  fn,
}: {
  spanName: string;
  context: ServerContext;
  attributes?: Record<string, string | number | boolean | undefined>;
  fn: () => Promise<TResult>;
}): Promise<TResult> =>
  instrumentAsync(
    { name: spanName, spanKind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttributes({
        "langfuse.project.id": context.projectId,
        "langfuse.org.id": context.orgId,
        "mcp.api_key_id": context.apiKeyId,
        ...Object.fromEntries(
          Object.entries(attributes ?? {}).filter(
            (entry): entry is [string, string | number | boolean] =>
              entry[1] !== undefined,
          ),
        ),
      });

      return await fn();
    },
  );
