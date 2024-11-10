import { env } from "@/src/env.mjs";
import { type User } from "next-auth";

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
  pgExecution: (input: T) => Promise<Y>,
  clickhouseExecution: (input: T) => Promise<Y>,
) => {
  if (input.queryClickhouse && !isClickhouseEligible()) {
    throw new Error("Not eligible to query clickhouse");
  }

  if (!input.queryClickhouse) {
    return await pgExecution(input);
  }

  if (env.LANGFUSE_READ_FROM_CLICKHOUSE_AND_POSTGRES === "false") {
    return pgExecution(input);
  }

  const promises = await Promise.all([
    pgExecution(input),
    clickhouseExecution(input),
  ]);

  if (env.LANGFUSE_RETURN_FROM_CLICKHOUSE === "true") {
    return promises[1];
  }
  return promises[0];
};
