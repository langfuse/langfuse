import { env } from "@/src/env.mjs";
import {
  instrumentAsync,
  logger,
  recordHistogram,
} from "@langfuse/shared/src/server";
import { type User } from "next-auth";
import * as opentelemetry from "@opentelemetry/api";
import { TRPCError } from "@trpc/server";

export const isClickhouseAdminEligible = (user?: User | null) => {
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
  input: T & { queryClickhouse: boolean; projectId: string };
  user: User | undefined | null;
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

      if (input.queryClickhouse && !isClickhouseAdminEligible(user)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not eligible to query clickhouse",
        });
      }

      // if query clickhouse, return clickhouse only. Only possible for admin users
      if (input.queryClickhouse) {
        return await clickhouseExecution(input);
      }

      // logic for regular users:
      // if env.LANGFUSE_READ_FROM_POSTGRES_ONLY is true, return postgres only
      // otherwise fetch both and compare timing
      // if env.LANGFUSE_RETURN_FROM_CLICKHOUSE is true, return clickhouse data

      const isExcludedFromClickhouse =
        user?.featureFlags.excludeClickhouseRead ?? false;

      if (
        env.LANGFUSE_READ_FROM_POSTGRES_ONLY === "true" ||
        isExcludedFromClickhouse
      ) {
        logger.info("Read from postgres only");
        return await pgExecution(input);
      }

      logger.debug("Read from postgres and clickhouse");
      try {
        const [[pgResult, pgDuration], [chResult, chDuration]] =
          await Promise.all([
            executionWrapper(input, pgExecution, currentSpan, "pg"),
            executionWrapper(input, clickhouseExecution, currentSpan, "ch"),
          ]);
        // Positive duration difference means clickhouse is faster
        const durationDifference = pgDuration - chDuration;
        currentSpan?.setAttribute(
          "execution-time-difference",
          durationDifference,
        );
        currentSpan?.setAttribute("pg-duration", pgDuration);
        currentSpan?.setAttribute("ch-duration", chDuration);

        recordHistogram("langfuse.clickhouse_experiment", chDuration, {
          operation: args.operation,
          database: "clickhouse",
        });
        recordHistogram("langfuse.clickhouse_experiment", pgDuration, {
          operation: args.operation,
          database: "postgres",
        });

        return env.LANGFUSE_RETURN_FROM_CLICKHOUSE === "true"
          ? chResult
          : pgResult;
      } catch (e) {
        logger.error(
          "Error in clickhouse experiment wrapper. Retrying leading store.",
          e,
        );
        return env.LANGFUSE_RETURN_FROM_CLICKHOUSE === "true"
          ? clickhouseExecution(input)
          : pgExecution(input);
      }
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
