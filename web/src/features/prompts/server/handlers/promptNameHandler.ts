import type { NextApiRequest, NextApiResponse } from "next";

import { getPromptByName } from "@/src/features/prompts/server/actions/getPromptByName";
import { deletePrompt } from "@/src/features/prompts/server/actions/deletePrompt";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { authorizePromptRequestOrThrow } from "../utils/authorizePromptRequest";
import {
  GetPromptByNameSchema,
  LangfuseNotFoundError,
  PRODUCTION_LABEL,
} from "@langfuse/shared";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { prisma } from "@langfuse/shared/src/db";
import { Prisma } from "@langfuse/shared/src/db";
import { isOceanBase } from "@langfuse/shared/src/server";

const getPromptNameHandler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const authCheck = await authorizePromptRequestOrThrow(req);

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    authCheck.scope,
    "prompts",
  );

  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  const { promptName, version, label, resolve } = GetPromptByNameSchema.parse(
    req.query,
  );

  const prompt = await getPromptByName({
    promptName: promptName,
    projectId: authCheck.scope.projectId,
    version,
    label,
    resolve: resolve ?? true, // Default to true for backward compatibility
  });

  if (!prompt) {
    let errorMessage = `Prompt not found: '${promptName}'`;

    if (version) {
      errorMessage += ` with version ${version}`;
    } else {
      errorMessage += ` with label '${label ?? PRODUCTION_LABEL}'`;
    }

    throw new LangfuseNotFoundError(errorMessage);
  }

  res.status(200).json({
    ...prompt,
    isActive: (prompt.labels as string[]).includes(PRODUCTION_LABEL),
  });
};

const deletePromptNameHandler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const authCheck = await authorizePromptRequestOrThrow(req);

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    authCheck.scope,
    "prompts",
  );

  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  const { promptName, version, label } = GetPromptByNameSchema.parse(req.query);

  // Fetch prompts for audit logging (OB: labels are JSON, filter in memory; PG: use labels.has)
  let prompts;
  if (label) {
    if (isOceanBase()) {
      const all = await prisma.prompt.findMany({
        where: {
          projectId: authCheck.scope.projectId,
          name: promptName,
          ...(version !== undefined && version !== null ? { version } : {}),
        },
      });
      prompts = all.filter((p) => (p.labels as string[]).includes(label));
    } else {
      prompts = await prisma.prompt.findMany({
        where: {
          projectId: authCheck.scope.projectId,
          name: promptName,
          ...(version !== undefined && version !== null ? { version } : {}),
          labels: { has: label },
        } as Prisma.PromptWhereInput,
      });
    }
  } else {
    prompts = await prisma.prompt.findMany({
      where: {
        projectId: authCheck.scope.projectId,
        name: promptName,
        ...(version !== undefined && version !== null ? { version } : {}),
      },
    });
  }

  // Audit log before deletion
  for (const prompt of prompts) {
    await auditLog({
      action: "delete",
      resourceType: "prompt",
      resourceId: prompt.id,
      projectId: authCheck.scope.projectId,
      orgId: authCheck.scope.orgId,
      apiKeyId: authCheck.scope.apiKeyId,
      before: prompt,
    });
  }

  // Delete prompt versions
  await deletePrompt({
    promptName,
    projectId: authCheck.scope.projectId,
    version,
    label,
    promptVersions: prompts,
  });

  res.status(204).end();
};

export const promptNameHandler = withMiddlewares({
  GET: getPromptNameHandler,
  DELETE: deletePromptNameHandler,
});
