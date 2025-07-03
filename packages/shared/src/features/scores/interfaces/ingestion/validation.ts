import z from "zod/v4";
import { applyScoreValidation } from "../../../../utils/scores";
import { PostScoreBodyFoundationSchema } from "../shared";
import { isPresent } from "../../../../utils/typeChecks";
import { Category as ConfigCategory } from "../../scoreConfigTypes";

export const ScoreBodyWithoutConfig = applyScoreValidation(
  z.discriminatedUnion("dataType", [
    PostScoreBodyFoundationSchema.merge(
      z.object({
        value: z.number(),
        dataType: z.literal("NUMERIC"),
      }),
    ),
    PostScoreBodyFoundationSchema.merge(
      z.object({
        value: z.string(),
        dataType: z.literal("CATEGORICAL"),
      }),
    ),
    PostScoreBodyFoundationSchema.merge(
      z.object({
        value: z.number().refine((val) => val === 0 || val === 1, {
          message: "Value must be either 0 or 1",
        }),
        dataType: z.literal("BOOLEAN"),
      }),
    ),
  ]),
);

const ScorePropsAgainstConfigNumeric = z
  .object({
    value: z.number(),
    maxValue: z.number().optional(),
    minValue: z.number().optional(),
    dataType: z.literal("NUMERIC"),
  })
  .superRefine((data, ctx) => {
    if (isPresent(data.maxValue) && data.value > data.maxValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Value exceeds maximum value of ${data.maxValue} defined in config`,
      });
    }
    if (isPresent(data.minValue) && data.value < data.minValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Value is below minimum value of ${data.minValue} defined in config`,
      });
    }
  });

const ScorePropsAgainstConfigCategorical = z
  .object({
    value: z.string(),
    categories: z.array(ConfigCategory),
    dataType: z.literal("CATEGORICAL"),
  })
  .superRefine((data, ctx) => {
    if (!data.categories.some(({ label }) => label === data.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Value ${data.value} does not map to a valid category. Pass a valid category value.`,
      });
    }
  });

export const ScorePropsAgainstConfig = z.union([
  ScorePropsAgainstConfigNumeric,
  ScorePropsAgainstConfigCategorical,
  z.object({
    value: z.number().refine((val) => val === 0 || val === 1, {
      message: "Value must be either 0 or 1",
    }),
    dataType: z.literal("BOOLEAN"),
  }),
]);
