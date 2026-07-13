import { z } from "zod";
import { LATEST_SKILL_LABEL } from "@langfuse/shared";

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { updateSkillLabelsForApi } from "@/src/features/skills/server/skill-api-service";

const UpdateSkillBodySchema = z.object({
  newLabels: z
    .array(z.string())
    .refine((labels) => !labels.includes(LATEST_SKILL_LABEL), {
      message: "Label 'latest' is always assigned to the latest skill version",
    }),
});

export const skillVersionHandler = withMiddlewares({
  PATCH: createAuthedProjectAPIRoute({
    name: "Update Skill",
    bodySchema: UpdateSkillBodySchema,
    responseSchema: z.any(),
    fn: async ({ body, req, auth }) => {
      const { newLabels } = UpdateSkillBodySchema.parse(body);
      const { skillName, skillVersion } = req.query;

      const { updatedSkill } = await updateSkillLabelsForApi({
        context: auth.scope,
        skillName: skillName as string,
        skillVersion: Number(skillVersion),
        newLabels,
      });

      return updatedSkill;
    },
  }),
});
