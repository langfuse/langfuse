import { env } from "../../env";
import { logger } from "../../server/logger";
import {
  DatasetRunItemsExecutionStrategy,
  DatasetRunItemsOperationType,
} from "./types";
/**
 * Returns the execution strategy for dataset run items based on environment variables.
 *
 * Two-phase migration approach:
 * 1. Dual-write phase: DATASET_RUN_ITEMS_WRITE_TO_CLICKHOUSE=true (write to both databases)
 * 2. Read migration phase: DATASET_RUN_ITEMS_READ_FROM_CLICKHOUSE=true (read from ClickHouse)
 */
function getDatasetRunItemsExecutionStrategy(): DatasetRunItemsExecutionStrategy {
  return {
    shouldWriteToClickHouse:
      env.LANGFUSE_EXPERIMENT_DATASET_RUN_ITEMS_WRITE_CH === "true",
    shouldReadFromClickHouse:
      env.LANGFUSE_EXPERIMENT_DATASET_RUN_ITEMS_READ_CH === "true",
  };
}

// Re-export the enum for backward compatibility

/**
 * Executes the appropriate database operation based on the execution strategy.
 *
 * @param postgresExecution - Function to execute PostgreSQL operation
 * @param clickhouseExecution - Function to execute ClickHouse operation
 * @param operationType - Type of operation ("read" or "write")
 * @returns Result from the selected execution strategy
 */
export async function executeWithDatasetRunItemsStrategy<TInput, TOutput>({
  input,
  operationType,
  postgresExecution,
  clickhouseExecution,
}: {
  input: TInput;
  operationType: DatasetRunItemsOperationType;
  // eslint-disable-next-line no-unused-vars
  postgresExecution: (input: TInput) => Promise<TOutput>;
  // eslint-disable-next-line no-unused-vars
  clickhouseExecution: (input: TInput) => Promise<TOutput>;
}): Promise<TOutput> {
  const strategy = getDatasetRunItemsExecutionStrategy();

  if (operationType === DatasetRunItemsOperationType.WRITE) {
    // For write operations, implement dual-write strategy
    if (strategy.shouldWriteToClickHouse) {
      // Dual-write phase: write to both databases
      const postgresResult = await postgresExecution(input);

      try {
        await clickhouseExecution(input);
        logger.debug("Successfully wrote to both PostgreSQL and ClickHouse", {
          operation: `dataset_run_items_${operationType}`,
        });
      } catch (error) {
        logger.error("ClickHouse write failed during dual-write phase", {
          error: error instanceof Error ? error.message : String(error),
          operation: `dataset_run_items_${operationType}`,
        });
        // Continue with PostgreSQL result since it succeeded
      }

      return postgresResult;
    } else {
      // Write only to PostgreSQL
      return await postgresExecution(input);
    }
  } else {
    // For read operations, rely on the strategy
    const shouldExecuteClickhouse = strategy.shouldReadFromClickHouse;

    if (shouldExecuteClickhouse) {
      try {
        return await clickhouseExecution(input);
      } catch (error) {
        logger.error(
          "ClickHouse execution failed, falling back to PostgreSQL",
          {
            error: error instanceof Error ? error.message : String(error),
            operation: `dataset_run_items_${operationType}`,
          },
        );
        // Fallback to PostgreSQL for reliability
        return await postgresExecution(input);
      }
    } else {
      return await postgresExecution(input);
    }
  }
}
