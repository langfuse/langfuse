import {
  PrepareSkillUploadsBodySchema,
  PrepareSkillUploadsResponseSchema,
} from "@langfuse/shared";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/features/public-api/server";
import { getSkillService } from "@/src/features/skills/server";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Prepare Skill Uploads",
    action: "skills:CUD",
    bodySchema: PrepareSkillUploadsBodySchema,
    responseSchema: PrepareSkillUploadsResponseSchema,
    successStatusCode: 201,
    rateLimitResource: "public-api",
    fn: ({ body, auth }) =>
      getSkillService().prepareUploads({
        projectId: auth.scope.projectId,
        createdBy: "API",
        input: body,
      }),
  }),
});
