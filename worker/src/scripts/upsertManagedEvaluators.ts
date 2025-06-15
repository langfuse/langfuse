import { z } from "zod/v4";
import { prisma } from "@langfuse/shared/src/db";
import managedEvaluators from "../constants/managed-evaluators.json";
import { logger } from "@langfuse/shared/src/server";
import { extractVariables } from "@langfuse/shared";

const ManagedEvaluatorSchema = z.object({
  id: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  name: z.string(),
  partner: z.string().nullish(),
  version: z.number(),
  outputSchema: z.object({
    score: z.string(),
    reasoning: z.string(),
  }),
  prompt: z.string(),
});

/**
 * Synchronizes managed evaluator templates with the database.
 * Loads predefined evaluators from JSON, validates them through Zod,
 * and upserts them into the eval_templates table.
 *
 * IDs and timestamps are stored in JSON to guarantee deterministic results and stable diffs.
 *
 * @param force - If true, updates all evaluators regardless of their last update time.
 *                If false, only updates evaluators that are outdated.
 */

export const upsertManagedEvaluators = async (force = false) => {
  const startTime = Date.now();
  try {
    const parsedManagedEvaluators = z
      .array(ManagedEvaluatorSchema)
      .parse(managedEvaluators);

    const existingEvaluators = await prisma.evalTemplate.findMany({
      where: {
        projectId: null,
        id: { in: parsedManagedEvaluators.map((e) => e.id) },
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });
    const existingEvaluatorsMap = new Map(
      existingEvaluators.map((e) => [e.id, e.updatedAt]),
    );

    const upsertPromises = parsedManagedEvaluators.map((evaluator) => {
      const existingUpdatedAt = existingEvaluatorsMap.get(evaluator.id);
      if (
        !force &&
        existingUpdatedAt &&
        existingUpdatedAt.getTime() === evaluator.updated_at.getTime()
      ) {
        logger.debug(
          `Evaluator ${evaluator.name} already up to date. Skipping.`,
        );
        return Promise.resolve();
      }

      const baseEvaluator = {
        name: evaluator.name,
        partner: evaluator.partner,
        version: evaluator.version,
        outputSchema: evaluator.outputSchema,
        prompt: evaluator.prompt,
        updatedAt: evaluator.updated_at,
      };

      return prisma.evalTemplate
        .upsert({
          where: { id: evaluator.id },
          update: {
            ...baseEvaluator,
          },
          create: {
            ...baseEvaluator,
            id: evaluator.id,
            projectId: null,
            updatedAt: evaluator.updated_at,
            vars: parsePromptVariables(evaluator.prompt),
          },
        })
        .then(() =>
          logger.info(`Upserted evaluator ${evaluator.name} (${evaluator.id})`),
        )
        .catch((error) => {
          logger.error(
            `Error upserting evaluator ${evaluator.name} (${evaluator.id}): ${error.message}`,
            { error },
          );
        });
    });

    await Promise.all(upsertPromises);
    logger.info(
      `Finished upserting Langfuse dashboards and widgets in ${Date.now() - startTime}ms`,
    );
  } catch (error) {
    logger.error(
      `Error upserting managed evaluators after ${Date.now() - startTime}ms: ${
        error instanceof Error ? error.message : ""
      }`,
    );
  }
};

const parsePromptVariables = (prompt: string): string[] => {
  const variables = extractVariables(prompt)
    .map((v) => v.trim())
    .filter(Boolean);

  return variables;
};
