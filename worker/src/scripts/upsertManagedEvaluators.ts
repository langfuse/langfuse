import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import managedEvaluators from "../constants/managed-evaluators.json";
import { logger } from "@langfuse/shared/src/server";
import { extractVariables } from "@langfuse/shared";

const ManagedEvaluatorSchema = z.object({
  id: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  name: z.string(),
  version: z.number(),
  outputSchema: z.object({
    score: z.string(),
    reasoning: z.string(),
  }),
  prompt: z.string(),
});
type ManagedEvaluator = z.infer<typeof ManagedEvaluatorSchema>;

const ExistingManagedEvaluatorSchema = z.object({
  evaluatorId: z.string(),
  evaluatorUpdatedAt: z.coerce.date(),
});

/**
 * Upserts managed evaluators into the database into the eval_templates table.
 *
 * This function performs the following operations:
 * 1. Fetches existing managed evaluators from the database (single query, not in transaction).
 * 2. Parses and validates the managed evaluators from the JSON file in the constants folder.
 * 3. Processes the managed evaluators in batches.
 *
 * Transaction behavior:
 * - Each evaluator is upserted individually (not in a transaction)
 * - Batches are processed sequentially, not in parallel
 *
 * Batching:
 * - Managed evaluators are processed in batches of 10 to optimize performance / not overwhelm the database
 *
 * Server start-time overhead:
 * - If all evaluators are up-to-date and 'force' is false, only the initial query to fetch
 *   existing evaluator update dates will be executed.
 *
 * @param force - If true, updates all evaluators regardless of their last update time.
 *                If false, only updates evaluators that are outdated.
 */

export const upsertManagedEvaluators = async (force = false) => {
  const startTime = Date.now();
  try {
    logger.debug(`Starting upsert of managed evaluators (force = ${force})`);

    const parsedManagedEvaluators = z
      .array(ManagedEvaluatorSchema)
      .parse(managedEvaluators);

    const existingManagedEvaluatorsQuery = await prisma.$queryRaw`
      SELECT
        et.id AS "evaluatorId",
        et.updated_at AS "evaluatorUpdatedAt"
      FROM
        eval_templates et
      WHERE
        et.project_id IS NULL
    `;

    const existingManagedEvaluators =
      ExistingManagedEvaluatorSchema.array().parse(
        existingManagedEvaluatorsQuery,
      );

    // Store in a map for O(1) lookup.
    const existingManagedEvaluatorMap = new Map<string, { updatedAt: Date }>(
      existingManagedEvaluators.map((em) => [
        em.evaluatorId,
        {
          updatedAt: em.evaluatorUpdatedAt,
        },
      ]),
    );

    // Upsert in batches
    const batchSize = 10;
    const numBatches = Math.ceil(parsedManagedEvaluators.length / batchSize);

    for (let i = 0; i < numBatches; i++) {
      logger.debug(`Processing batch ${i + 1} of ${numBatches}...`);

      const batch = parsedManagedEvaluators.slice(
        i * batchSize,
        (i + 1) * batchSize,
      );

      for (const managedEvaluator of batch) {
        const existingManagedEvaluatorUpdateDate =
          existingManagedEvaluatorMap.get(managedEvaluator.id);

        if (
          !force &&
          existingManagedEvaluatorUpdateDate &&
          isExistingManagedEvaluatorUpToDate(
            existingManagedEvaluatorUpdateDate,
            managedEvaluator,
          )
        ) {
          logger.debug(
            `Managed evaluator ${managedEvaluator.name} (${managedEvaluator.id}) already up to date. Skipping.`,
          );
          continue;
        }

        await prisma.evalTemplate.upsert({
          where: {
            id: managedEvaluator.id,
            projectId: null,
          },
          update: {
            name: managedEvaluator.name,
            version: managedEvaluator.version,
            outputSchema: managedEvaluator.outputSchema,
            prompt: managedEvaluator.prompt,
            updatedAt: managedEvaluator.updated_at,
          },
          create: {
            projectId: null,
            id: managedEvaluator.id,
            name: managedEvaluator.name,
            version: managedEvaluator.version,
            outputSchema: managedEvaluator.outputSchema,
            prompt: managedEvaluator.prompt,
            createdAt: managedEvaluator.created_at,
            updatedAt: managedEvaluator.updated_at,
            vars: parsePromptVariables(managedEvaluator.prompt),
          },
        });

        logger.debug(`Completed batch ${i + 1} of ${numBatches}`);
      }
    }
    logger.info(
      `Finished upserting managed evaluators in ${Date.now() - startTime}ms`,
    );
  } catch (error) {
    logger.error(
      `Error upserting managed evaluators after ${Date.now() - startTime}ms: ${
        error instanceof Error ? error.message : ""
      }`,
      {
        error,
      },
    );
  }
};

const isExistingManagedEvaluatorUpToDate = (
  existingManagedEvaluator: { updatedAt: Date },
  managedEvaluator: ManagedEvaluator,
): boolean => {
  return (
    existingManagedEvaluator.updatedAt.getTime() ===
    managedEvaluator.updated_at.getTime()
  );
};

const parsePromptVariables = (prompt: string): string[] => {
  const variables = extractVariables(prompt)
    .map((v) => v.trim())
    .filter(Boolean);

  return variables;
};
