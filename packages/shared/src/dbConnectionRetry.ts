import { Prisma } from "@prisma/client";
import { logger } from "./server/logger";

// Covers a Postgres restart (e.g. an Aurora minor-version upgrade or failover),
// which refuses connections for one to two seconds.
const RETRY_DELAYS_MS = [250, 750, 1500];

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

const CONNECTION_ERROR_MESSAGES = [
  "the database system is starting up",
  "the database system is shutting down",
  "terminating connection due to administrator command",
  "Error opening a TLS connection",
];

// P1001: server unreachable, P1017: server closed the connection.
const isConnectionError = (error: unknown): boolean => {
  const code = errorCode(error);
  if (code === "P1001" || code === "P1017") return true;
  const message = errorMessage(error);
  return CONNECTION_ERROR_MESSAGES.some((m) => message.includes(m));
};

// Writes and raw queries are never retried: a dropped connection may already
// have committed them, and a retried operation from a batch $transaction would
// run outside that transaction.
const isRetryable = (error: unknown, operation: string): boolean =>
  READ_OPERATIONS.has(operation) && isConnectionError(error);

export const withPostgresConnectionRetry = async <T>(
  context: { model?: string; operation: string },
  run: () => Promise<T>,
  delaysMs: number[] = RETRY_DELAYS_MS,
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= delaysMs.length || !isRetryable(error, context.operation))
        throw error;

      logger.warn(
        `Retrying Postgres ${context.model ?? "raw"}.${context.operation} after connection error (attempt ${attempt + 1})`,
        { error: errorMessage(error) },
      );
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
};

export const postgresConnectionRetryExtension = Prisma.defineExtension({
  name: "postgresConnectionRetry",
  query: {
    $allOperations({ model, operation, args, query }) {
      return withPostgresConnectionRetry({ model, operation }, () =>
        query(args),
      );
    },
  },
});
