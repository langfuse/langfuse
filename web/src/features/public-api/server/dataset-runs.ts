import { type jsonSchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";
import type z from "zod/v4";

type Json = z.infer<typeof jsonSchema>;

const isUniqueConstraintError = (error: any): boolean => {
  return (
    error.code === "P2002" || // Prisma unique constraint
    error.message?.includes("duplicate key") ||
    error.message?.includes("UNIQUE constraint") ||
    error.message?.includes("violates unique constraint")
  );
};

/**
 * Create or fetch a dataset run with optimistic concurrency handling.
 *
 * Behavior:
 * - First tries to find an existing run by (projectId, datasetId, name).
 * - If not found, attempts to create it.
 * - If creation fails due to a unique constraint (likely created concurrently),
 *   fetches and returns the existing run.
 * - If all steps fail, throws an error.
 *
 * Rationale: The public API can receive many POST requests almost simultaneously,
 * which is not concurrency-safe without this guard.
 */
export const createOrFetchDatasetRun = async ({
  projectId,
  datasetId,
  name,
  description,
  metadata,
}: {
  projectId: string;
  datasetId: string;
  name: string;
  description?: string;
  metadata?: Json | null;
}) => {
  try {
    // Attempt to fetch existing run
    const existingRun = await prisma.datasetRuns.findUnique({
      where: {
        datasetId_projectId_name: {
          datasetId,
          projectId,
          name: name,
        },
      },
    });
    if (existingRun) {
      return existingRun;
    }

    // Attempt creation
    const datasetRun = await prisma.datasetRuns.create({
      data: {
        id: v4(),
        datasetId,
        projectId,
        name,
        description: description ?? null,
        metadata: metadata ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return datasetRun;
  } catch (error) {
    // Check if it's a unique constraint violation
    if (isUniqueConstraintError(error)) {
      // Fetch existing run
      const existingRun = await prisma.datasetRuns.findUnique({
        where: {
          datasetId_projectId_name: {
            datasetId,
            projectId,
            name: name,
          },
        },
      });

      if (existingRun) {
        return existingRun;
      }
    } else {
      throw error;
    }
  }

  throw new Error("Failed to create or fetch dataset run");
};
