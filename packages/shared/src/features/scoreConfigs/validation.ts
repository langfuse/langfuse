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
  onParseError?: (error: z.ZodError) => void,
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
