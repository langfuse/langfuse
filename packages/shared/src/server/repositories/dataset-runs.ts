import { type jsonSchema } from "../../utils/zod";
import { prisma } from "../../db";
import { v4 } from "uuid";
import type z from "zod";

type Json = z.infer<typeof jsonSchema>;

/**
 * Create or fetch a dataset run using an atomic upsert.
 *
 * Behavior:
 * - Uses Prisma upsert on the (datasetId, projectId, name) unique constraint
 *   so concurrent callers all converge to the same run without errors.
 * - If the run already exists, returns it unchanged.
 *
 * Rationale: The public API can receive many POST requests almost simultaneously
 * (e.g. dataset.run_experiment with max_concurrency > 1). The previous
 * create-then-catch approach worked but logged Prisma unique-constraint errors
 * on every concurrent call. Upsert is atomic and silent.
 */
export const createOrFetchDatasetRun = async ({
  projectId,
  datasetId,
  name,
  description,
  metadata,
  createdAt,
}: {
  projectId: string;
  datasetId: string;
  name: string;
  description?: string;
  metadata?: Json | null;
  createdAt?: Date;
}) => {
  return prisma.datasetRuns.upsert({
    where: {
      datasetId_projectId_name: {
        datasetId,
        projectId,
        name,
      },
    },
    create: {
      id: v4(),
      datasetId,
      projectId,
      name,
      description: description ?? null,
      metadata: metadata ?? {},
      createdAt: createdAt ?? new Date(),
      updatedAt: createdAt ?? new Date(),
    },
    update: {}, // Run already exists, return it unchanged
  });
};
