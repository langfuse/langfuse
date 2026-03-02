/**
 * Query executor data layer: re-exports executeQuery and validateQuery
 * from serverOb when OceanBase is enabled, otherwise from the default ClickHouse executor.
 * This is the single switch point for routing dashboard and metrics API to OceanBase.
 */
import { isOceanBase } from "@langfuse/shared/src/server";
import * as chExecutor from "./queryExecutor";
import * as obExecutor from "../serverOb/queryExecutor";

export type { QueryValidationResult } from "./queryExecutor";

export function executeQuery(
  ...args: Parameters<typeof chExecutor.executeQuery>
): Promise<Array<Record<string, unknown>>> {
  return (isOceanBase() ? obExecutor.executeQuery : chExecutor.executeQuery)(
    ...args,
  );
}

export function validateQuery(
  ...args: Parameters<typeof chExecutor.validateQuery>
): ReturnType<typeof chExecutor.validateQuery> {
  return (isOceanBase() ? obExecutor.validateQuery : chExecutor.validateQuery)(
    ...args,
  );
}
