import { env } from "../../env";

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
  // Single Write Strategy: WRITE operation
  if (operation === OperationType.WRITE) {
    // Either write to versioned implementation OR stateful implementation
    if (
      env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION === "true"
    ) {
      return await implementations[Implementation.VERSIONED]();
    } else {
      return await implementations[Implementation.STATEFUL]();
    }
  }

  // READ operation - use configured source
  if (
    env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION === "true"
  ) {
    return implementations[Implementation.VERSIONED]();
  }
  return implementations[Implementation.STATEFUL]();
}
