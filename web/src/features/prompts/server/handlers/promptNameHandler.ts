import type { NextApiRequest, NextApiResponse } from "next";
import { getPromptById } from "@/src/features/prompts/server/actions/getPromptByName";
import { withMiddlewares } from "@/src/server/utils/withMiddlewares";
import { authorizePromptRequestOrThrow } from "../utils/authorizePromptRequest";

const getPromptNameHandler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const authCheck = await authorizePromptRequestOrThrow(req);
  const { promptName : id } = req.query; //promptName is used to recieve id

  const prompt = await getPromptById(id as string);

  return res.status(200).json(prompt);
};

export const promptNameHandler = withMiddlewares({ GET: getPromptNameHandler });
