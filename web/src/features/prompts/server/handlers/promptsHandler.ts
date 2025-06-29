import { type NextApiRequest, type NextApiResponse } from "next";

import { createPrompt } from "@/src/features/prompts/server/actions/createPrompt";
import { getPromptsMeta } from "@/src/features/prompts/server/actions/getPromptsMeta";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { prisma } from "@langfuse/shared/src/db";
import { authorizePromptRequestOrThrow } from "../utils/authorizePromptRequest";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import {
  CreatePromptSchema,
  GetPromptsMetaSchema,
  InvalidRequestError,
} from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const getPromptsHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  const authCheck = await authorizePromptRequestOrThrow(req);

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    authCheck.scope,
    "prompts",
  );

  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  const input = GetPromptsMetaSchema.parse(req.query);
  const promptsMetadata = await getPromptsMeta({
    ...input,
    projectId: authCheck.scope.projectId,
  });

  return res.status(200).json(promptsMetadata);
};

const postPromptsHandler = async (
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

  const input = CreatePromptSchema.parse(req.body);
  const createdPrompt = await createPrompt({
    ...input,
    config: input.config ?? {},
    projectId: authCheck.scope.projectId,
    createdBy: "API",
    prisma: prisma,
  }).catch((err) => {
    if (
      typeof err === "object" &&
      err.constructor.name === "PrismaClientKnownRequestError" &&
      err.code === "P2002" // Unique constraint failed: https://www.prisma.io/docs/orm/reference/error-reference#p2002
    ) {
      throw new InvalidRequestError(
        `Failed to create prompt '${input.name}' due to unique constraint failure. This is likely due to too many concurrent prompt creations for this prompt name. Please add a delay.`,
      );
    }

    throw err;
  });

  await auditLog({
    action: "create",
    resourceType: "prompt",
    resourceId: createdPrompt.id,
    projectId: authCheck.scope.projectId,
    orgId: authCheck.scope.orgId,
    apiKeyId: authCheck.scope.apiKeyId,
    after: createdPrompt,
  });

  return res.status(201).json(createdPrompt);
};

export const promptsHandler = withMiddlewares({
  GET: getPromptsHandler,
  POST: postPromptsHandler,
});
