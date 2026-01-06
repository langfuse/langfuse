import { randomUUID } from "crypto";
import { env } from "../../env";
import { logger } from "../logger";
import { clickhouseClient, convertDateToClickhouseDateTime } from "./client";
import { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";
import { ClickHouseSettings } from "@clickhouse/client";
import { instrumentAsync } from "../instrumentation";
import { SpanKind } from "@opentelemetry/api";

/**
 * Options for executing a DELETE command with mutation monitoring.
 */
export interface MutationWaiterOptions {
  tableName: string;
  query: string;
  params?: Record<string, unknown>;
  tags?: Record<string, string>;
  clickhouseConfigs?: NodeClickHouseClientConfigOptions;
  clickhouseSettings?: ClickHouseSettings;
  timeoutMs: number;
  pollIntervalMs: number;
}

interface MutationStatus {
  is_done: number;
  latest_fail_reason: string;
}

const MUTATION_STATUS_QUERY = `
  SELECT
    is_done,
    latest_fail_reason
  FROM system.mutations
  WHERE database = {database: String}
    AND table = {table: String}
    AND command LIKE {uuidPattern: String}
    AND create_time >= toDateTime({startTime: DateTime64(3)})
  ORDER BY create_time DESC
  LIMIT 1
`;

const MUTATION_NOT_VISIBLE_RETRY_LIMIT = 5;
const MUTATION_NOT_VISIBLE_RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Injects the UUID marker into the WHERE clause of a DELETE query.
 * Handles queries with or without trailing semicolons.

 * The marker is a constant expression that survives ClickHouse's mutation rewrite.
 * SQL comments are stripped, but constant expressions like `AND 'uuid' = 'uuid'`
 * are preserved in the mutation command stored in system.mutations.
 */
function injectUuidMarker(query: string, uuid: string): string {
  const uuidMarker = `AND 'mutation-${uuid}' = 'mutation-${uuid}'`;
  const trimmed = query.trim();
  const hasSemicolon = trimmed.endsWith(";");
  const base = hasSemicolon ? trimmed.slice(0, -1) : trimmed;
  return `${base} ${uuidMarker}`;
}

/**
 * Polls system.mutations table waiting for a mutation to complete.
 */
async function waitForMutation(
  uuid: string,
  tableName: string,
  mutationStartTime: Date,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<void> {
  const pollStartTime = Date.now();
  const uuidPattern = `%'mutation-${uuid}'%`;
  const startTimeStr = convertDateToClickhouseDateTime(mutationStartTime);
  let notVisibleCount = 0;

  while (Date.now() - pollStartTime < timeoutMs) {
    const result = await clickhouseClient({
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    }).query({
      query: MUTATION_STATUS_QUERY,
      query_params: {
        database: env.CLICKHOUSE_DB,
        table: tableName,
        uuidPattern,
        startTime: startTimeStr,
      },
      format: "JSONEachRow",
    });

    const rows = await result.json<MutationStatus>();

    if (
      rows.length === 0 &&
      notVisibleCount >= MUTATION_NOT_VISIBLE_RETRY_LIMIT
    ) {
      throw new Error(
        `Could not found mutation ${uuid} for table ${tableName} after ${notVisibleCount} attempts`,
      );
    }

    if (rows.length === 0) {
      notVisibleCount += 1;
      // Mutation not yet visible, wait and retry
      logger.debug(
        `Mutation ${uuid} not yet visible in system.mutations, waiting...`,
      );
      await sleep(MUTATION_NOT_VISIBLE_RETRY_DELAY_MS);
      continue;
    }

    const mutation = rows[0];
    if (mutation.is_done === 1) {
      logger.info(`Mutation ${uuid} completed for table ${tableName}`, {
        durationMs: Date.now() - pollStartTime,
      });
      return; // Success
    }

    if (mutation.latest_fail_reason) {
      throw new Error(
        `Mutation ${uuid} failed: ${mutation.latest_fail_reason}`,
      );
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Mutation ${uuid} timeout after ${timeoutMs}ms for table ${tableName}`,
  );
}

/**
 * Executes a DELETE command with mutation monitoring.
 *
 * When LANGFUSE_MUTATION_MONITOR_ENABLED is true, this function:
 * 1. Injects a UUID as a SQL comment to identify the mutation
 * 2. Executes the command with a short timeout (just enough to create the mutation)
 * 3. Polls system.mutations table to track the mutation until completion
 *
 * This avoids HTTP connection timeouts for long-running DELETE operations
 * where the actual mutation completes faster than the connection timeout.
 */
export async function executeWithMutationMonitoring(
  opts: MutationWaiterOptions,
): Promise<void> {
  return instrumentAsync(
    { name: "clickhouse-mutation-waiter", spanKind: SpanKind.CLIENT },
    async (span) => {
      const uuid = randomUUID();
      const queryWithUuid = injectUuidMarker(opts.query, uuid);

      span.setAttribute("ch.mutation.uuid", uuid);
      span.setAttribute("ch.mutation.table", opts.tableName);
      span.setAttribute("ch.query.text", queryWithUuid);
      span.setAttribute("db.system", "clickhouse");
      span.setAttribute("db.operation.name", "MUTATION_WAIT");

      logger.info(
        `Starting mutation ${uuid} for table ${opts.tableName} with polling`,
        {
          tableName: opts.tableName,
          timeoutMs: opts.timeoutMs,
          pollIntervalMs: opts.pollIntervalMs,
        },
      );

      // Record the start time before executing the command - used to filter mutations
      const mutationStartTime = new Date();

      // Execute with lightweight_deletes_sync=0 to return immediately after mutation is created
      await clickhouseClient({
        ...opts.clickhouseConfigs,
      }).command({
        query: queryWithUuid,
        query_params: opts.params,
        clickhouse_settings: {
          ...opts.clickhouseSettings,
          lightweight_deletes_sync: "0",
          log_comment: JSON.stringify({
            ...opts.tags,
            mutationId: uuid,
          }),
        },
      });

      logger.debug(`Mutation ${uuid} command returned, starting to poll`);

      // Poll system.mutations to wait for completion
      await waitForMutation(
        uuid,
        opts.tableName,
        mutationStartTime,
        opts.timeoutMs,
        opts.pollIntervalMs,
      );

      span.setAttribute("ch.mutation.completed", true);
    },
  );
}
