import { prisma } from "@langfuse/shared/src/db";
import {
  CreateSkillVersionBodySchema,
  ListSkillsQuerySchema,
  ListSkillsResponseSchema,
  SkillVersionSchema,
} from "@langfuse/shared";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/features/public-api/server";
import { SkillService } from "@/src/features/skills/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "List Skills",
    action: "skills:read",
    querySchema: ListSkillsQuerySchema,
    responseSchema: ListSkillsResponseSchema,
    rateLimitResource: "public-api",
    fn: ({ query, auth }) =>
      new SkillService(prisma).list({
        projectId: auth.scope.projectId,
        input: query,
      }),
  }),
  POST: createAuthedProjectAPIRoute({
    name: "Create Skill Version",
    action: "skills:CUD",
    bodySchema: CreateSkillVersionBodySchema,
    responseSchema: SkillVersionSchema,
    successStatusCode: 201,
    rateLimitResource: "public-api",
    fn: ({ body, auth, ctx }) =>
      new SkillService(prisma).createVersion({
        projectId: auth.scope.projectId,
        createdBy: "API",
        input: body,
        actor: {
          apiKeyId: auth.scope.apiKeyId!,
          orgId: auth.scope.orgId,
          projectId: auth.scope.projectId,
          accessLevel: auth.scope.accessLevel,
          ctx,
        },
      }),
  }),
});
