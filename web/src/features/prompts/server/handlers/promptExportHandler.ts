import type { NextApiRequest, NextApiResponse } from "next";

import { authorizePromptRequestOrThrow } from "../utils/authorizePromptRequest";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { prisma } from "@langfuse/shared/src/db";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";

const getExportHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  const authCheck = await authorizePromptRequestOrThrow(req);

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    authCheck.scope,
    "prompts",
  );

  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  const prompts = await prisma.prompt.findMany({
    where: { projectId: authCheck.scope.projectId },
    orderBy: [{ name: "asc" }, { version: "asc" }],
  });

  return res.status(200).json(prompts);
};

export const promptExportHandler = withMiddlewares({
  GET: getExportHandler,
});
