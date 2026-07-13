import { type NextApiRequest, type NextApiResponse } from "next";

import {
  createSkillForApi,
  listSkillsForApi,
} from "@/src/features/skills/server/skill-api-service";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { authorizeSkillRequestOrThrow } from "../utils/authorizeSkillRequest";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { CreateSkillSchema, GetSkillsMetaSchema } from "@langfuse/shared";

const getSkillsHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  const authCheck = await authorizeSkillRequestOrThrow(req);

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    authCheck.scope,
    "skills",
  );

  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  const input = GetSkillsMetaSchema.parse(req.query);
  const skillsMetadata = await listSkillsForApi({
    ...input,
    projectId: authCheck.scope.projectId,
  });

  return res.status(200).json(skillsMetadata);
};

const postSkillsHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  const authCheck = await authorizeSkillRequestOrThrow(req);

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    authCheck.scope,
    "skills",
  );

  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  const input = CreateSkillSchema.parse(req.body);
  const createdSkill = await createSkillForApi({
    context: authCheck.scope,
    input,
  });

  return res.status(201).json(createdSkill);
};

export const skillsHandler = withMiddlewares({
  GET: getSkillsHandler,
  POST: postSkillsHandler,
});
