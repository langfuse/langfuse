import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { authorizePromptRequestOrThrow } from "../utils/authorizePromptRequest";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createPrompt } from "@/src/features/prompts/server/actions/createPrompt";
import { CreatePromptSchema } from "@/src/features/prompts/server/utils/validation";
import { prisma } from "@langfuse/shared/src/db";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";

const postImportHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  const authCheck = await authorizePromptRequestOrThrow(req);

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    authCheck.scope,
    "prompts",
  );

  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  const data = z
    .object({ prompts: z.array(CreatePromptSchema) })
    .parse(req.body);

  for (const prompt of data.prompts) {
    await createPrompt({
      ...prompt,
      config: prompt.config ?? {},
      projectId: authCheck.scope.projectId,
      createdBy: "API",
      prisma,
    });
  }

  return res.status(201).json({ success: true, count: data.prompts.length });
};

export const promptImportHandler = withMiddlewares({
  POST: postImportHandler,
});
