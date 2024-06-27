import type { NextApiRequest, NextApiResponse } from "next";
import { getPrompts } from "@/src/features/prompts/server/actions/getPromptByName";
import { withMiddlewares } from "@/src/server/utils/withMiddlewares";
import { authorizePromptRequestOrThrow } from "../utils/authorizePromptRequest";

const getPromptNameHandler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const authCheck = await authorizePromptRequestOrThrow(req);

  const { projectId, promptName } = req.query;

  const prompt = await getPrompts(projectId as string, promptName as string);

  return res.status(200).json(prompt);
};

export const promptNameHandler = withMiddlewares({ GET: getPromptNameHandler });
