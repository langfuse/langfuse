import { prisma } from "@langfuse/shared/src/db";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/public-api/server";
import {
  GetSkillFileContentsQuerySchema,
  GetSkillFileContentsResponseSchema,
} from "@/src/public-api/types/unstable-skills";
import { SkillService } from "@/src/ai/skills/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Skill File Contents",
    action: "skills:read",
    querySchema: GetSkillFileContentsQuerySchema,
    responseSchema: GetSkillFileContentsResponseSchema,
    rateLimitResource: "public-api",
    fn: async ({ query, auth, res }) => {
      res.setHeader("Cache-Control", "no-store");
      return new SkillService(prisma).getFileContents({
        projectId: auth.scope.projectId,
        sha256Hashes: query.sha256Hashes,
      });
    },
  }),
});
