import { env } from "@/src/env.mjs";
import { getCurrentSpan } from "@langfuse/shared/src/server";
import { type User } from "next-auth";
import type * as opentelemetry from "@opentelemetry/api";

export const isClickhouseEligible = (user?: User | null) => {
  return (
    user &&
    user.admin &&
    user.admin === true &&
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
    ["US", "EU", "STAGING", "DEV"].includes(
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    )
  );
};

export const measureAndReturnApi = async <T, Y>(
  input: T & { queryClickhouse: boolean },
  user: User | undefined,
  pgExecution: (input: T) => Promise<Y>,
  clickhouseExecution: (input: T) => Promise<Y>,
) => {
  const currentSpan = getCurrentSpan();

  if (!user) {
    throw new Error("User not found");
  }

  if (input.queryClickhouse && !isClickhouseEligible(user)) {
    throw new Error("Not eligible to query clickhouse");
  }

  if (!input.queryClickhouse) {
    return await pgExecution(input);
  }

  if (env.LANGFUSE_READ_FROM_CLICKHOUSE_AND_POSTGRES === "false") {
    return pgExecution(input);
  }

  const [[pgResult, pgDuration], [chResult, chDuration]] = await Promise.all([
    executionWrapper(input, pgExecution, currentSpan, "pg"),
    executionWrapper(input, clickhouseExecution, currentSpan, "ch"),
  ]);

  const durationDifference = Math.abs(pgDuration - chDuration);
  currentSpan?.setAttribute("execution-time-difference", durationDifference);

  if (env.LANGFUSE_RETURN_FROM_CLICKHOUSE === "true") {
    return chResult;
  }
  return pgResult;
};

const executionWrapper = async <T, Y>(
  input: T & { queryClickhouse: boolean },
  fn: (input: T) => Promise<Y>,
  span?: opentelemetry.Span,
  attributePrefix?: string,
): Promise<[Y, number]> => {
  const startTime = Date.now();
  const res = await fn(input);
  const duration = Date.now() - startTime;
  span?.setAttribute(`${attributePrefix}-duration`, duration);
  return [res, duration];
};
