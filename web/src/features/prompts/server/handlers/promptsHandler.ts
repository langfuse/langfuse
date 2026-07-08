import { type NextApiRequest, type NextApiResponse } from "next";

import {
  createPromptForApi,
  listPromptsForApi,
} from "@/src/features/prompts/server/prompt-api-service";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { authorizePromptRequestOrThrow } from "../utils/authorizePromptRequest";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { CreatePromptSchema, GetPromptsMetaSchema } from "@langfuse/shared";

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
  const promptsMetadata = await listPromptsForApi({
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
  const createdPrompt = await createPromptForApi({
    context: authCheck.scope,
    input,
  });

  return res.status(201).json(createdPrompt);
};

export const promptsHandler = withMiddlewares({
  GET: getPromptsHandler,
  POST: postPromptsHandler,
});
