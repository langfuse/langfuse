import { prisma } from "@langfuse/shared/src/db";
import {
  PrepareSkillUploadsBodySchema,
  PrepareSkillUploadsResponseSchema,
} from "@langfuse/shared";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/features/public-api/server";
import { SkillService } from "@/src/features/skills/server";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Prepare Skill Uploads",
    action: "skills:CUD",
    bodySchema: PrepareSkillUploadsBodySchema,
    responseSchema: PrepareSkillUploadsResponseSchema,
    successStatusCode: 201,
    rateLimitResource: "public-api",
    fn: ({ body, auth }) =>
      new SkillService(prisma).prepareUploads({
        projectId: auth.scope.projectId,
        input: body,
      }),
  }),
});
