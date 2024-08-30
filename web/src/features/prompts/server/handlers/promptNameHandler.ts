import type { NextApiRequest, NextApiResponse } from "next";

import { getPromptByName } from "@/src/features/prompts/server/actions/getPromptByName";
import { GetPromptByNameSchema } from "@/src/features/prompts/server/utils/validation";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { redis } from "@langfuse/shared/src/server";
import { authorizePromptRequestOrThrow } from "../utils/authorizePromptRequest";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { PRODUCTION_LABEL } from "@/src/features/prompts/constants";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";

const getPromptNameHandler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const authCheck = await authorizePromptRequestOrThrow(req);

  const rateLimitCheck = await new RateLimitService(redis).rateLimitRequest(
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

  return res.status(200).json(prompt);
};

export const promptNameHandler = withMiddlewares({ GET: getPromptNameHandler });
