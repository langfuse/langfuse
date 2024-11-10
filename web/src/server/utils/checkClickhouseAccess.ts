import { env } from "@/src/env.mjs";
import { instrumentAsync, logger } from "@langfuse/shared/src/server";
import { type User } from "next-auth";
import * as opentelemetry from "@opentelemetry/api";
import { TRPCError } from "@trpc/server";

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

export const measureAndReturnApi = async <T, Y>(args: {
  input: T & { queryClickhouse: boolean };
  user: User | undefined;
  operation: string;
  pgExecution: (input: T) => Promise<Y>;
  clickhouseExecution: (input: T) => Promise<Y>;
}) => {
  return instrumentAsync(
    {
      name: "clickhouse-experiment",
      spanKind: opentelemetry.SpanKind.INTERNAL,
    },
    async (currentSpan) => {
      const { input, user, pgExecution, clickhouseExecution } = args;

      currentSpan?.setAttribute("operation", args.operation);

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Did not find user in function context",
        });
      }

      if (input.queryClickhouse && !isClickhouseEligible(user)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not eligible to query clickhouse",
        });
      }

      if (!input.queryClickhouse) {
        return await pgExecution(input);
      }

      if (input.queryClickhouse) {
        return await clickhouseExecution(input);
      }

      if (env.LANGFUSE_READ_FROM_POSTGRES_ONLY === "true") {
        logger.info("Read from postgres only");
        return await pgExecution(input);
      }

      logger.info("Read from postgres and clickhouse");
      const [[pgResult, pgDuration], [chResult, chDuration]] =
        await Promise.all([
          executionWrapper(input, pgExecution, currentSpan, "pg"),
          executionWrapper(input, clickhouseExecution, currentSpan, "ch"),
        ]);

      const durationDifference = Math.abs(pgDuration - chDuration);
      currentSpan?.setAttribute(
        "execution-time-difference",
        durationDifference,
      );
      currentSpan?.setAttribute("pg-duration", pgDuration);
      currentSpan?.setAttribute("ch-duration", chDuration);

      if (env.LANGFUSE_RETURN_FROM_CLICKHOUSE === "true") {
        logger.info("Return data from clickhouse");
        return chResult;
      }
      return pgResult;
    },
  );
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
