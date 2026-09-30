import { prisma } from "@langfuse/shared/src/db";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/features/public-api/server";
import {
  GetSkillFileContentsBodySchema,
  GetSkillFileContentsResponseSchema,
} from "@/src/features/public-api/types/unstable-skills";
import { SkillService } from "@/src/features/skills/server";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Get Skill File Contents",
    action: "skills:read",
    bodySchema: GetSkillFileContentsBodySchema,
    responseSchema: GetSkillFileContentsResponseSchema,
    rateLimitResource: "public-api",
    fn: async ({ body, auth, res }) => {
      res.setHeader("Cache-Control", "no-store");
      return new SkillService(prisma).getFileContents({
        projectId: auth.scope.projectId,
        sha256Hashes: body.sha256Hashes,
      });
    },
  }),
});
