import { env } from "../../env";
import { logger } from "../logger";

/**
 * Returns the execution strategy for dataset run items based on environment variables.
 *
 * Two-phase migration approach:
 * 1. Dual-write phase: DATASET_RUN_ITEMS_WRITE_TO_CLICKHOUSE=true (write to both databases)
 * 2. Read migration phase: DATASET_RUN_ITEMS_READ_FROM_CLICKHOUSE=true (read from ClickHouse)
 */
export function getDatasetRunItemsExecutionStrategy() {
  return {
    shouldWriteToClickHouse: env.LANGFUSE_DATASET_RUN_ITEMS_WRITE_TO_CLICKHOUSE,
    shouldReadFromClickHouse:
      env.LANGFUSE_DATASET_RUN_ITEMS_READ_FROM_CLICKHOUSE,
  };
}

/**
 * Executes the appropriate database operation based on the execution strategy.
 *
 * @param postgresExecution - Function to execute PostgreSQL operation
 * @param clickhouseExecution - Function to execute ClickHouse operation
 * @returns Result from the selected execution strategy
 */
export async function executeWithDatasetRunItemsStrategy<T>({
  postgresExecution,
  clickhouseExecution,
  shouldExecuteClickhouse = false,
}: {
  postgresExecution: () => Promise<T>;
  clickhouseExecution: () => Promise<T>;
  shouldExecuteClickhouse?: boolean;
}): Promise<T> {
  if (shouldExecuteClickhouse) {
    try {
      return await clickhouseExecution();
    } catch (error) {
      logger.error("ClickHouse execution failed, falling back to PostgreSQL", {
        error: error instanceof Error ? error.message : String(error),
        operation: "dataset_run_items_read",
      });
      // Fallback to PostgreSQL for reliability
      return await postgresExecution();
    }
  } else {
    return await postgresExecution();
  }
}
