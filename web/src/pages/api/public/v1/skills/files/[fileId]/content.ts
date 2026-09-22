import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod/v4";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/features/public-api/server";
import { SkillService } from "@/src/features/skills/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Download Skill File",
    action: "skills:read",
    querySchema: z.object({ fileId: z.string().min(1) }),
    responseSchema: z.void(),
    successStatusCode: 307,
    rateLimitResource: "public-api",
    fn: async ({ query, auth, res }) => {
      const { downloadUrl } = await new SkillService(prisma).getFileDownload({
        projectId: auth.scope.projectId,
        fileId: query.fileId,
      });
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Location", downloadUrl);
    },
  }),
});
