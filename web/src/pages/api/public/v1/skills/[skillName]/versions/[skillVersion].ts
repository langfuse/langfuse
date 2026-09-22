import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod/v4";
import {
  DeleteSkillVersionResponseSchema,
  SkillNameSchema,
  SkillVersionSchema,
  UpdateSkillLabelsBodySchema,
} from "@langfuse/shared";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/features/public-api/server";
import { SkillService } from "@/src/features/skills/server";

const versionQuerySchema = z.object({
  skillName: SkillNameSchema,
  skillVersion: z.coerce.number().int().positive(),
});

export default withMiddlewares({
  PATCH: createAuthedProjectAPIRoute({
    name: "Update Skill Version Labels",
    action: "skills:CUD",
    querySchema: versionQuerySchema,
    bodySchema: UpdateSkillLabelsBodySchema,
    responseSchema: SkillVersionSchema,
    rateLimitResource: "public-api",
    fn: ({ query, body, auth }) =>
      new SkillService(prisma).setLabels({
        projectId: auth.scope.projectId,
        name: query.skillName,
        version: query.skillVersion,
        labels: body.labels,
        auditActor: {
          apiKeyId: auth.scope.apiKeyId!,
          orgId: auth.scope.orgId,
          projectId: auth.scope.projectId,
        },
      }),
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Skill Version",
    action: "skills:CUD",
    querySchema: versionQuerySchema,
    responseSchema: DeleteSkillVersionResponseSchema,
    rateLimitResource: "public-api",
    fn: async ({ query, auth }) => {
      await new SkillService(prisma).deleteVersion({
        projectId: auth.scope.projectId,
        name: query.skillName,
        version: query.skillVersion,
        auditActor: {
          apiKeyId: auth.scope.apiKeyId!,
          orgId: auth.scope.orgId,
          projectId: auth.scope.projectId,
        },
      });
      return { deleted: true };
    },
  }),
});
