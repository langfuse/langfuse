import { z } from "zod/v4";
import { ScoreConfig as ScoreConfigDbType } from "@prisma/client";
import {
  ScoreConfigDomain,
  ScoreConfigSchema,
} from "../../domain/score-configs";

/**
 * Use this function when pulling a list of score configs from the database before using in the application to ensure type safety.
 * All score configs are expected to pass the validation. If a score fails validation, it will be logged to Otel.
 * @param scoreConfigs
 * @returns list of validated score configs
 */
export const filterAndValidateDbScoreConfigList = (
  scoreConfigs: ScoreConfigDbType[],
  onParseError?: (error: z.ZodError) => void, // eslint-disable-line no-unused-vars
): ScoreConfigDomain[] =>
  scoreConfigs.reduce((acc, ts) => {
    const result = ScoreConfigSchema.safeParse(ts);
    if (result.success) {
      acc.push(result.data);
    } else {
      onParseError?.(result.error);
    }
    return acc;
  }, [] as ScoreConfigDomain[]);

/**
 * Use this function when pulling a single score config from the database before using in the application to ensure type safety.
 * The score is expected to pass the validation. If a score fails validation, an error will be thrown.
 * @param scoreConfig
 * @returns validated score config
 * @throws error if score fails validation
 */
export const validateDbScoreConfig = (
  scoreConfig: ScoreConfigDbType,
): ScoreConfigDomain => ScoreConfigSchema.parse(scoreConfig);

/**
 * Use this function when pulling a single score config from the database before using in the application to ensure type safety.
 * This function will NOT throw an error by default. The score is expected to pass the validation.
 * @param scoreConfig
 * @returns score config validation object:
 * - success: true if the score config passes validation
 * - data: the validated score config if success is true
 * - error: the error object if success is false
 */
export const validateDbScoreConfigSafe = (scoreConfig: ScoreConfigDbType) =>
  ScoreConfigSchema.safeParse(scoreConfig);

// // Unified input schema for both create and update operations
// export const ScoreConfigInputSchema = z.object({
//   name: z.string().min(1).max(35),
//   description: z.string().optional(),
//   dataType: z.enum(["NUMERIC", "CATEGORICAL", "BOOLEAN"]),
//   minValue: z.number().optional(),
//   maxValue: z.number().optional(),
//   categories: z.array(ScoreConfigCategory).optional(),
// });

// export const validateScoreConfigInput = (
//   input: z.infer<typeof ScoreConfigInputSchema>,
// ): string | null => {
//   const { dataType, minValue, maxValue, categories } = input;

//   // Numeric validation
//   if (dataType === "NUMERIC") {
//     if (isPresent(maxValue) && isPresent(minValue) && maxValue <= minValue) {
//       return "Maximum value must be greater than Minimum value.";
//     }
//   }

//   // Categorical and Boolean validation
//   if ((dataType === "CATEGORICAL" || dataType === "BOOLEAN") && categories) {
//     // Boolean must have exactly 2 categories
//     if (dataType === "BOOLEAN" && categories.length !== 2) {
//       return "Boolean data type must have exactly 2 categories.";
//     }

//     // Check for unique labels and values
//     const uniqueLabels = new Set<string>();
//     const uniqueValues = new Set<number>();

//     for (const category of categories) {
//       if (uniqueLabels.has(category.label)) {
//         return "Category names must be unique.";
//       }
//       uniqueLabels.add(category.label);

//       if (uniqueValues.has(category.value)) {
//         return "Category values must be unique.";
//       }
//       uniqueValues.add(category.value);
//     }

//     // Boolean categories must be 0 and 1
//     if (dataType === "BOOLEAN") {
//       const values = categories.map((c) => c.value).sort();
//       if (values[0] !== 0 || values[1] !== 1) {
//         return "Boolean data type must have categories with values 0 and 1.";
//       }
//     }
//   }

//   // Required categories for categorical/boolean types
//   if (
//     (dataType === "CATEGORICAL" || dataType === "BOOLEAN") &&
//     (!categories || categories.length === 0)
//   ) {
//     return `${dataType === "BOOLEAN" ? "Boolean" : "Categorical"} data type requires categories.`;
//   }

//   return null;
// };
