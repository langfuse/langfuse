import { SkillFileContentResponseSchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod/v4";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/features/public-api/server";
import { SkillService } from "@/src/features/skills/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Skill File Content",
    action: "skills:read",
    querySchema: z.object({ fileId: z.string().min(1) }),
    responseSchema: SkillFileContentResponseSchema,
    rateLimitResource: "public-api",
    fn: async ({ query, auth, res }) => {
      res.setHeader("Cache-Control", "no-store");
      return new SkillService(prisma).getFileContent({
        projectId: auth.scope.projectId,
        fileId: query.fileId,
      });
    },
  }),
});
