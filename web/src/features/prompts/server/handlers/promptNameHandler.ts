import type { NextApiRequest, NextApiResponse } from "next";

import { getPromptByName } from "@/src/features/prompts/server/actions/getPromptByName";
import { GetPromptByNameSchema } from "@/src/features/prompts/server/utils/validation";
import { withMiddlewares } from "@/src/server/utils/withMiddlewares";
import { MethodNotAllowedError } from "@langfuse/shared";

import { authorizePromptRequestOrThrow } from "../utils/authorizePromptRequest";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const authCheck = await authorizePromptRequestOrThrow(req);
  if (req.method !== "GET") throw new MethodNotAllowedError();

  const { promptName, version, label } = GetPromptByNameSchema.parse(req.query);

  const prompt = await getPromptByName({
    promptName: promptName,
    projectId: authCheck.scope.projectId,
    version,
    label,
  });

  return res.status(200).json(prompt);
};

export const promptNameHandler = withMiddlewares(handler);
