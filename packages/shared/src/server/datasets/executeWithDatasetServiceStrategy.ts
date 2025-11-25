import { env } from "../../env";
import { logger } from "../logger";

export enum OperationType {
  READ = "READ",
  WRITE = "WRITE",
}

export enum Implementation {
  STATEFUL = "STATEFUL",
  VERSIONED = "VERSIONED",
}

type Implementations<T> = {
  [Implementation.STATEFUL]: () => Promise<T>;
  [Implementation.VERSIONED]: () => Promise<T>;
};

export async function executeWithDatasetServiceStrategy<T>(
  operation: OperationType,
  implementations: Implementations<T>,
): Promise<T> {
  // Dual Write Strategy: WRITE operation
  if (operation === OperationType.WRITE) {
    // Always write to stateful implementation
    const statefulResult = await implementations[Implementation.STATEFUL]();

    // Optionally write to versioned implementation
    if (
      env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION === "true"
    ) {
      await implementations[Implementation.VERSIONED]().catch((e) => {
        // Don't throw - stateful write succeeded
        logger.info("Failed to write to versioned implementation", {
          error: e,
        });
      });
    }

    return statefulResult;
  }

  // READ operation - use configured source
  if (
    env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION === "true"
  ) {
    return implementations[Implementation.VERSIONED]();
  }
  return implementations[Implementation.STATEFUL]();
}

/**
 * Converts internal dataset item representation to Postgres DatasetItem format.
 * Removes itemId, keeps id. Preserves createdAt/updatedAt.
 */
export function toPostgresDatasetItem<
  T extends { itemId: string; [key: string]: any },
>(item: T): Omit<T, "itemId"> & { id: string } {
  const { itemId, ...rest } = item;
  return { ...rest, id: itemId };
}
