import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod/v4";
import {
  SkillNameSchema,
  SkillSelectorSchema,
  SkillVersionSchema,
} from "@langfuse/shared";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/features/public-api/server";
import { SkillService } from "@/src/features/skills/server";

const querySchema = SkillSelectorSchema.and(
  z.object({ skillName: SkillNameSchema }),
);

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Skill",
    action: "skills:read",
    querySchema,
    responseSchema: SkillVersionSchema,
    rateLimitResource: "public-api",
    fn: async ({ query, auth }) =>
      new SkillService(prisma).get({
        projectId: auth.scope.projectId,
        name: query.skillName,
        selector: query,
      }),
  }),
});
