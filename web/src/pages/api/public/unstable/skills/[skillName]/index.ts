import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod/v4";
import {
  SkillNameSchema,
  SkillSelectorSchema,
  SkillVersionSchema,
  UpdateSkillTagsBodySchema,
} from "@langfuse/shared";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/features/public-api/server";
import { SkillService } from "@/src/features/skills/server";
import { GetSkillResponseSchema } from "@/src/features/public-api/types/unstable-skills";

const querySchema = SkillSelectorSchema.and(
  z.object({
    skillName: SkillNameSchema,
    includeContent: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  }),
);

export default withMiddlewares({
  PATCH: createAuthedProjectAPIRoute({
    name: "Update Skill",
    action: "skills:CUD",
    querySchema: z.object({ skillName: SkillNameSchema }),
    bodySchema: UpdateSkillTagsBodySchema,
    responseSchema: SkillVersionSchema,
    rateLimitResource: "public-api",
    fn: ({ query, body, auth, ctx }) =>
      new SkillService(prisma).setTags({
        projectId: auth.scope.projectId,
        name: query.skillName,
        tags: body.tags,
        actor: {
          apiKeyId: auth.scope.apiKeyId!,
          orgId: auth.scope.orgId,
          projectId: auth.scope.projectId,
          accessLevel: auth.scope.accessLevel,
          ctx,
        },
      }),
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Skill",
    action: "skills:read",
    querySchema,
    responseSchema: GetSkillResponseSchema,
    rateLimitResource: "public-api",
    fn: async ({ query, auth, res }) => {
      if (query.includeContent) res.setHeader("Cache-Control", "no-store");
      return new SkillService(prisma).get({
        projectId: auth.scope.projectId,
        name: query.skillName,
        selector: query,
        includeContent: query.includeContent,
      });
    },
  }),
});
