import { type NextApiRequest, type NextApiResponse } from "next";

import { createPrompt } from "@/src/features/prompts/server/actions/createPrompt";
import { getPromptsMeta } from "@/src/features/prompts/server/actions/getPromptsMeta";
import {
  CreatePromptSchema,
  GetPromptsMetaSchema,
} from "@/src/features/prompts/server/utils/validation";
import { withMiddlewares } from "@/src/server/utils/withMiddlewares";
import { prisma } from "@langfuse/shared/src/db";
import { authorizePromptRequestOrThrow } from "../utils/authorizePromptRequest";

const getPromptsHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  const authCheck = await authorizePromptRequestOrThrow(req);
  const { projectId, ...query } = req.query;
  const input = GetPromptsMetaSchema.parse(query);
  const promptsMetadata = await getPromptsMeta({
    ...input,
    projectId: projectId as string,
  });

  return res.status(200).json(promptsMetadata);
};

const postPromptsHandler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const authCheck = await authorizePromptRequestOrThrow(req);
  const { projectId, ...payload } = req.body;
  const input = CreatePromptSchema.parse(payload);
  const createdPrompt = await createPrompt({
    ...input,
    config: input.config ?? {},
    projectId: projectId,
    createdBy: "API",
    prisma: prisma,
  });

  return res.status(201).json(createdPrompt);
};

export const promptsHandler = withMiddlewares({
  GET: getPromptsHandler,
  POST: postPromptsHandler,
});