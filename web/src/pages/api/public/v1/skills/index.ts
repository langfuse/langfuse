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
import { getSkillService } from "@/src/features/skills/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "List Skills",
    action: "skills:read",
    querySchema: ListSkillsQuerySchema,
    responseSchema: ListSkillsResponseSchema,
    rateLimitResource: "public-api",
    fn: ({ query, auth }) =>
      getSkillService().list({
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
    fn: ({ body, auth }) =>
      getSkillService().createVersion({
        projectId: auth.scope.projectId,
        createdBy: "API",
        input: body,
        auditActor: {
          apiKeyId: auth.scope.apiKeyId!,
          orgId: auth.scope.orgId,
          projectId: auth.scope.projectId,
        },
      }),
  }),
});
