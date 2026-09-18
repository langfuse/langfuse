import { z } from "zod/v4";
import {
  SkillNameSchema,
  SkillSelectorSchema,
  SkillVersionWithDownloadsSchema,
} from "@langfuse/shared";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/features/public-api/server";
import { getSkillService } from "@/src/features/skills/server";

const querySchema = SkillSelectorSchema.and(
  z.object({ skillName: SkillNameSchema }),
);

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Skill",
    action: "skills:read",
    querySchema,
    responseSchema: SkillVersionWithDownloadsSchema,
    rateLimitResource: "public-api",
    fn: async ({ query, auth }) =>
      SkillVersionWithDownloadsSchema.parse(
        await getSkillService().get({
          projectId: auth.scope.projectId,
          name: query.skillName,
          selector: query,
          includeDownloadUrls: true,
        }),
      ),
  }),
});
