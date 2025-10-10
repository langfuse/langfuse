import {
  clickhouseClient,
  getCurrentSpan,
  logger,
  QueueName,
  TQueueJobTypes,
  traceException,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { env } from "../../env";

/**
 * Processes the oldest partition from observations_batch_staging table
 * and propagates events to the events table. Only processes when at least
 * 2 partitions exist to ensure the oldest partition is complete.
 */
export const handleEventPropagationJob = async (
  job: Job<TQueueJobTypes[QueueName.EventPropagationQueue]>,
) => {
  const span = getCurrentSpan();
  if (span) {
    span.setAttribute("messaging.bullmq.job.input.jobId", job.data.id);
  }

  if (env.LANGFUSE_EXPERIMENT_EARLY_EXIT_EVENT_BATCH_JOB === "true") {
    logger.info("Early exit for event propagation job due to experiment flag");
    return;
  }

  const client = clickhouseClient();

  try {
    logger.debug("Starting event propagation batch processing");

    // Step 1: Get list of partitions ordered by time
    const partitionsResult = await client.query({
      query: `
        SELECT DISTINCT partition
        FROM system.parts
        WHERE table = 'observations_batch_staging'
          AND active = 1
        ORDER BY partition ASC
      `,
      format: "JSONEachRow",
    });

    const partitions = await partitionsResult.json<{ partition: string }>();

    if (partitions.length < 3) {
      logger.info(
        `Not enough partitions for processing. Found ${partitions.length} partition(s), need at least 3`,
      );
      return;
    }

    // Step 2: Process the oldest partition
    const oldestPartition = partitions[0].partition;
    logger.info(
      `Processing partition ${oldestPartition} for events table fill`,
    );

    // Step 3: Join observations_batch_staging with traces and insert into events
    // Use a time window for traces to limit the join scope
    await client.command({
      query: `
        INSERT INTO events (
          org_id,
          project_id,
          trace_id,
          span_id,
          parent_span_id,
          start_time,
          end_time,
          name,
          type,
          environment,
          version,
          user_id,
          session_id,
          level,
          status_message,
          completion_start_time,
          prompt_id,
          prompt_name,
          prompt_version,
          model_id,
          provided_model_name,
          model_parameters,
          provided_usage_details,
          usage_details,
          provided_cost_details,
          cost_details,
          total_cost,
          input,
          output,
          metadata,
          metadata_names,
          metadata_values,
          metadata_string_names,
          metadata_string_values,
          metadata_number_names,
          metadata_number_values,
          metadata_bool_names,
          metadata_bool_values,
          source,
          service_name,
          service_version,
          scope_name,
          scope_version,
          telemetry_sdk_language,
          telemetry_sdk_name,
          telemetry_sdk_version,
          blob_storage_file_path,
          event_raw,
          event_bytes,
          created_at,
          updated_at,
          event_ts,
          is_deleted
        )
        SELECT
          NULL AS org_id,
          obs.project_id,
          obs.trace_id,
          obs.id AS span_id,
          -- if parent_observation_id is null, use trace_id as parent_span_id
          -- this way we threat the case as the "wrapper" for spans backfilled this way.
          coalesce(obs.parent_observation_id, obs.trace_id) AS parent_span_id,
          -- Convert timestamps to microseconds
          obs.start_time * 1000 as start_time,
          obs.end_time * 1000 as end_time,
          obs.name,
          obs.type,
          obs.environment,
          obs.version,
          coalesce(t.user_id, '') AS user_id,
          coalesce(t.session_id, '') AS session_id,
          obs.level,
          coalesce(obs.status_message, '') AS status_message,
          obs.completion_start_time * 1000 AS completion_start_time,
          obs.prompt_id,
          obs.prompt_name,
          CAST(obs.prompt_version, 'Nullable(String)') AS prompt_version,
          obs.internal_model_id AS model_id,
          obs.provided_model_name,
          obs.model_parameters,
          obs.provided_usage_details,
          obs.usage_details,
          obs.provided_cost_details,
          obs.cost_details,
          coalesce(obs.total_cost, 0) AS total_cost,
          coalesce(obs.input, '') AS input,
          coalesce(obs.output, '') AS output,
          CAST(obs.metadata, 'JSON') AS metadata,
          mapKeys(obs.metadata) AS metadata_names,
          mapValues(obs.metadata) AS metadata_values,
          mapKeys(obs.metadata) AS metadata_string_names,
          mapValues(obs.metadata) AS metadata_string_values,
          [] AS metadata_number_names,
          [] AS metadata_number_values,
          [] AS metadata_bool_names,
          [] AS metadata_bool_values,
          multiIf(mapContains(obs.metadata, 'resourceAttributes'), 'otel', 'ingestion-api') AS source,
          NULL AS service_name,
          NULL AS service_version,
          NULL AS scope_name,
          NULL AS scope_version,
          NULL AS telemetry_sdk_language,
          NULL AS telemetry_sdk_name,
          NULL AS telemetry_sdk_version,
          '' AS blob_storage_file_path,
          '' AS event_raw,
          0 AS event_bytes,
          obs.created_at * 1000 AS created_at,
          obs.updated_at * 1000 AS updated_at,
          obs.event_ts * 1000 AS event_ts,
          obs.is_deleted
        FROM observations_batch_staging AS obs
        LEFT JOIN traces AS t ON (
          obs.trace_id = t.id AND obs.project_id = t.project_id
        )
        WHERE obs._partition_value = '(${oldestPartition})'
        and t._partition_value = '(${new Date().toISOString().slice(0, 7).replace("-", "")})'
      `,
      clickhouse_settings: {
        log_comment: JSON.stringify({
          feature: "ingestion",
          partition: oldestPartition,
          operation_name: "propagateObservationsToEvents",
        }),
      },
    });

    logger.info(
      `Successfully propagated observations from partition ${oldestPartition} to events table`,
    );

    // Step 4: Drop the processed partition
    await client.command({
      query: `
        ALTER TABLE observations_batch_staging
        DROP PARTITION '${oldestPartition}'
      `,
    });

    logger.info(
      `Dropped partition ${oldestPartition} after successful processing`,
    );
  } catch (error) {
    logger.error("Failed to process event propagation batch", error);
    traceException(error);
    throw error;
  }
};
