import { env } from "../../env";
import {
  DatasetRunItemsExecutionStrategy,
  DatasetRunItemsOperationType,
} from "./types";
/**
 * Returns the execution strategy for dataset run items based on environment variables.
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
    if (strategy.shouldWriteToClickHouse) {
      return await clickhouseExecution(input);
    } else {
      return await postgresExecution(input);
    }
  } else {
    // For read operations, rely on the strategy
    if (strategy.shouldReadFromClickHouse) {
      return await clickhouseExecution(input);
    } else {
      return await postgresExecution(input);
    }
  }
}
