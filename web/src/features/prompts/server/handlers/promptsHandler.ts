import { type NextApiRequest, type NextApiResponse } from "next";

import { createPrompt } from "@/src/features/prompts/server/actions/createPrompt";
import { getPromptsMeta } from "@/src/features/prompts/server/actions/getPromptsMeta";
import {
  CreatePromptSchema,
  GetPromptsMetaSchema,
} from "@/src/features/prompts/server/utils/validation";
import { withMiddlewares } from "@/src/server/utils/withMiddlewares";
import { MethodNotAllowedError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

import { authorizePromptRequestOrThrow } from "../utils/authorizePromptRequest";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const authCheck = await authorizePromptRequestOrThrow(req);

  if (req.method === "GET") {
    const input = GetPromptsMetaSchema.parse(req.query);
    const promptsMetadata = await getPromptsMeta({
      ...input,
      projectId: authCheck.scope.projectId,
    });

    return res.status(200).json(promptsMetadata);
  }

  if (req.method === "POST") {
    const input = CreatePromptSchema.parse(req.body);
    const createdPrompt = await createPrompt({
      ...input,
      config: input.config ?? {},
      projectId: authCheck.scope.projectId,
      createdBy: "API",
      prisma: prisma,
    });

    return res.status(201).json(createdPrompt);
  }

  throw new MethodNotAllowedError();
};

export const promptsHandler = withMiddlewares(handler);
