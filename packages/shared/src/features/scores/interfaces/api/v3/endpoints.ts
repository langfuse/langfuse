import { z } from "zod";
import { APIScoreSchemaV3 } from "./schemas";

export const SCORE_FIELD_GROUPS_V3 = [
  "core",
  "details",
  "subject",
  "annotation",
] as const;
export type ScoreFieldGroupV3 = (typeof SCORE_FIELD_GROUPS_V3)[number];

const fieldsParam = z
  .string()
  .optional()
  .transform((val) => (val ? val.split(",").map((g) => g.trim()) : ["core"]))
  .pipe(
    z.array(z.string()).superRefine((groups, ctx) => {
      for (const group of groups) {
        if (group === "trace") {
          ctx.addIssue({
            code: "custom",
            message: "fields=trace is reserved and not yet available",
          });
        } else if (
          !SCORE_FIELD_GROUPS_V3.includes(group as ScoreFieldGroupV3)
        ) {
          ctx.addIssue({
            code: "custom",
            message: `Unknown field group: "${group}". Allowed: ${SCORE_FIELD_GROUPS_V3.join(", ")}`,
          });
        }
      }
    }),
  );

// GET /v3/scores
export const GetScoresQueryV3 = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  fields: fieldsParam,
});

export const GetScoresResponseV3 = z.object({
  data: z.array(APIScoreSchemaV3),
  meta: z.object({
    limit: z.number(),
    cursor: z.string().optional(),
  }),
});
