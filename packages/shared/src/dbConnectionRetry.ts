import { Prisma } from "@prisma/client";
import { backOff } from "exponential-backoff";
import { logger } from "./server/logger";

const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

const errorCode = (error: unknown): string | undefined => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code;
  if (error instanceof Prisma.PrismaClientInitializationError)
    return error.errorCode;
  return undefined;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "";

// Matched on message too: a client without an open connection reports an
// unreachable server as PrismaClientInitializationError without an error code.
// Administrator termination is not matched: a deliberately killed query must not rerun.
const CONNECTION_ERROR_MESSAGES = [
  "Can't reach database server",
  "the database system is starting up",
  "the database system is shutting down",
  "the database system is in recovery mode",
  "the database system is not yet accepting connections",
  "terminating connection because of crash of another server process",
  "Error opening a TLS connection",
];

// P1001: server unreachable, P1017: server closed the connection.
const isConnectionError = (error: unknown): boolean => {
  const code = errorCode(error);
  if (code === "P1001" || code === "P1017") return true;
  const message = errorMessage(error);
  return CONNECTION_ERROR_MESSAGES.some((m) => message.includes(m));
};

// Retries cover a Postgres restart (e.g. an Aurora minor-version upgrade or
// failover), which refuses connections for one to two seconds.
// Writes and raw queries are never retried: a dropped connection may already
// have committed them.
const isRetryable = (error: unknown, operation: string): boolean =>
  READ_OPERATIONS.has(operation) && isConnectionError(error);

const MAX_ATTEMPTS = 4;

export const withPostgresConnectionRetry = <T>(
  context: { model?: string; operation: string },
  run: () => Promise<T>,
  startingDelayMs = 250,
): Promise<T> =>
  backOff(run, {
    numOfAttempts: MAX_ATTEMPTS,
    startingDelay: startingDelayMs,
    timeMultiple: 3,
    maxDelay: 1500,
    // Also called after the final attempt, which is never retried.
    retry: (error, attemptNumber) => {
      if (attemptNumber >= MAX_ATTEMPTS) return false;
      if (!isRetryable(error, context.operation)) return false;
      logger.warn(
        `Retrying Postgres ${context.model ?? "raw"}.${context.operation} after connection error (attempt ${attemptNumber})`,
        { error: errorMessage(error) },
      );
      return true;
    },
  });

export const postgresConnectionRetryExtension = Prisma.defineExtension({
  name: "postgresConnectionRetry",
  query: {
    $allOperations(params) {
      const { model, operation, args, query } = params;
      // Prisma exposes transaction membership only through undocumented runtime
      // metadata. Batch read retries can escape the transaction; interactive
      // read retries cannot recover a transaction whose connection is gone.
      const { __internalParams } = params as typeof params & {
        __internalParams?: { transaction?: unknown };
      };
      if (__internalParams?.transaction !== undefined) return query(args);

      return withPostgresConnectionRetry({ model, operation }, () =>
        query(args),
      );
    },
  },
});
