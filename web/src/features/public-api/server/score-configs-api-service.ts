import { v4 } from "uuid";
import { type z } from "zod";
import { isBooleanDataType } from "@/src/features/scores/lib/helpers";
import {
  InvalidRequestError,
  LangfuseNotFoundError,
  validateDbScoreConfig,
  validateDbScoreConfigSafe,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  type PostScoreConfigBody,
  type PutScoreConfigBody,
} from "@/src/features/public-api/types/score-configs";

export { listScoreConfigs, getScoreConfig } from "@langfuse/shared/src/server";

type ApiKeyProjectContext = {
  projectId: string;
  orgId: string;
  apiKeyId: string;
};

const inflateConfigBody = (body: z.infer<typeof PostScoreConfigBody>) => {
  if (isBooleanDataType(body.dataType)) {
    return {
      ...body,
      categories: [
        { label: "True", value: 1 },
        { label: "False", value: 0 },
      ],
    };
  }

  return body;
};

export const createScoreConfig = async ({
  context,
  body,
}: {
  context: ApiKeyProjectContext;
  body: z.infer<typeof PostScoreConfigBody>;
}) => {
  const inflatedConfigInput = inflateConfigBody(body);

  const config = await prisma.scoreConfig.create({
    data: {
      ...inflatedConfigInput,
      categories: inflatedConfigInput.categories ?? undefined,
      id: v4(),
      projectId: context.projectId,
    },
  });

  await auditLog({
    action: "create",
    resourceType: "scoreConfig",
    resourceId: config.id,
    projectId: context.projectId,
    orgId: context.orgId,
    apiKeyId: context.apiKeyId,
    after: config,
  });

  return validateDbScoreConfig(config);
};

export const updateScoreConfig = async ({
  context,
  configId,
  body,
}: {
  context: ApiKeyProjectContext;
  configId: string;
  body: z.infer<typeof PutScoreConfigBody>;
}) => {
  const existingConfig = await prisma.scoreConfig.findUnique({
    where: {
      id: configId,
      projectId: context.projectId,
    },
  });

  if (!existingConfig) {
    throw new LangfuseNotFoundError(
      "Score config not found within authorized project",
    );
  }

  const result = validateDbScoreConfigSafe({ ...existingConfig, ...body });

  if (!result.success) {
    throw new InvalidRequestError(
      result.error.issues.map((issue) => issue.message).join(", "),
    );
  }

  const config = await prisma.scoreConfig.update({
    where: {
      id: configId,
      projectId: context.projectId,
    },
    data: {
      ...body,
    },
  });

  await auditLog({
    action: "update",
    resourceType: "scoreConfig",
    resourceId: config.id,
    projectId: context.projectId,
    orgId: context.orgId,
    apiKeyId: context.apiKeyId,
    before: existingConfig,
    after: config,
  });

  return validateDbScoreConfig(config);
};

// Soft-archive a score config by flipping `isArchived` to true. Mirrors the
// semantic of the existing MCP `mcp.score_configs.delete` tool so the public
// API exposes a symmetric surface. Hard delete is intentionally out of scope;
// see https://github.com/langfuse/langfuse/issues/15642.
export const archiveScoreConfigForApi = async ({
  context,
  configId,
}: {
  context: ApiKeyProjectContext;
  configId: string;
}) => {
  const existingConfig = await prisma.scoreConfig.findUnique({
    where: {
      id: configId,
      projectId: context.projectId,
    },
  });

  if (!existingConfig) {
    throw new LangfuseNotFoundError(
      "Score config not found within authorized project",
    );
  }

  // If the config is already archived, treat the request as a no-op rather
  // than an error. This keeps the verb idempotent and avoids surprising
  // callers that re-issue the same DELETE.
  if (existingConfig.isArchived) {
    return { message: "Score config successfully archived" as const };
  }

  await prisma.scoreConfig.update({
    where: {
      id: configId,
      projectId: context.projectId,
    },
    data: {
      isArchived: true,
    },
  });

  await auditLog({
    action: "delete",
    resourceType: "scoreConfig",
    resourceId: existingConfig.id,
    projectId: context.projectId,
    orgId: context.orgId,
    apiKeyId: context.apiKeyId,
    before: existingConfig,
  });

  return { message: "Score config successfully archived" as const };
};
