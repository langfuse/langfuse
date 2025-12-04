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

  const { promptName, version, label } = GetPromptByNameSchema.parse(req.query);

  const prompt = await getPromptByName({
    promptName: promptName,
    projectId: authCheck.scope.projectId,
    version,
    label,
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

  res.status(200).json(prompt);
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

  // Fetch prompts for audit logging
  const where = {
    projectId: authCheck.scope.projectId,
    name: promptName,
    ...(version ? { version } : {}),
    ...(label ? { labels: { has: label } } : {}),
  };

  const prompts = await prisma.prompt.findMany({ where });

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

  // Delete prompts (pass fetched prompts to avoid duplicate query)
  await deletePrompt({
    promptName,
    projectId: authCheck.scope.projectId,
    version,
    label,
    prompts, // Pass prompts to avoid duplicate query
  });

  res.status(204).end();
};

export const promptNameHandler = withMiddlewares({
  GET: getPromptNameHandler,
  DELETE: deletePromptNameHandler,
});
