import {
  queryClickhouse,
  commandClickhouse,
  getCurrentSpan,
  logger,
  QueueName,
  TQueueJobTypes,
  traceException,
  EventPropagationQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { env } from "../../env";
import { randomUUID } from "crypto";

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

  try {
    logger.debug("Starting event propagation batch processing");

    // Step 1: Get list of partitions ordered by time
    const partitions = await queryClickhouse<{ partition: string }>({
      query: `
        SELECT DISTINCT partition
        FROM system.parts
        WHERE table = 'observations_batch_staging'
          AND active = 1
        ORDER BY partition ASC
      `,
      tags: {
        feature: "ingestion",
        operation_name: "getPartitions",
      },
    });

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
    // If clients send us an observation_start_time that is smaller than a previously received start_time
    // for the same span, this may create duplicates in the new events table. Deduplicating in this query
    // will significantly affect run-time. This may be an accepted degradation and we test the outcome
    // to check the likelihood of this happening in practice.
    await commandClickhouse({
      query: `
        with batch_stats as (
          select
            groupUniqArray(project_id) as project_ids,
            min(start_time) as min_start_time,
            max(start_time) as max_start_time
          from observations_batch_staging
          where _partition_value = tuple('${oldestPartition}')
        ), relevant_traces as (
          select
            t.id,
            t.project_id,
            t.user_id,
            t.session_id,
            t.metadata
          from traces t
          where t.project_id in (select arrayJoin(project_ids) from batch_stats)
            and t.timestamp >= (select min(min_start_time) - interval 1 day from batch_stats)
            and t.timestamp <= (select max(max_start_time) + interval 1 day from batch_stats)
        )

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
          -- When the observation IS the trace itself (id = trace_id), parent should be NULL
          -- Otherwise, use standard wrapper logic: parent_observation_id or trace_id as fallback
          CASE
            WHEN obs.id = obs.trace_id THEN NULL
            ELSE coalesce(obs.parent_observation_id, obs.trace_id)
          END AS parent_span_id,
          -- Convert timestamps from DateTime64(3) to DateTime64(6) via implicit conversion
          obs.start_time,
          obs.end_time,
          obs.name,
          obs.type,
          obs.environment,
          obs.version,
          coalesce(t.user_id, '') AS user_id,
          coalesce(t.session_id, '') AS session_id,
          obs.level,
          coalesce(obs.status_message, '') AS status_message,
          obs.completion_start_time,
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
          -- Merge trace and observation metadata, with observation taking precedence (first map wins)
          CAST(mapConcat(obs.metadata, coalesce(t.metadata, map())), 'JSON') AS metadata,
          mapKeys(mapConcat(obs.metadata, coalesce(t.metadata, map()))) AS metadata_names,
          mapValues(mapConcat(obs.metadata, coalesce(t.metadata, map()))) AS metadata_values,
          mapKeys(mapConcat(obs.metadata, coalesce(t.metadata, map()))) AS metadata_string_names,
          mapValues(mapConcat(obs.metadata, coalesce(t.metadata, map()))) AS metadata_string_values,
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
          obs.created_at,
          obs.updated_at,
          obs.event_ts,
          obs.is_deleted
        FROM relevant_traces t
        RIGHT JOIN observations_batch_staging AS obs
        ON (
          obs.project_id = t.project_id AND
          obs.trace_id = t.id
        )
        WHERE obs._partition_value = tuple('${oldestPartition}')
      `,
      tags: {
        feature: "ingestion",
        partition: oldestPartition,
        operation_name: "propagateObservationsToEvents",
      },
      clickhouseConfigs: {
        request_timeout: 600000, // 10 minutes timeout
      },
      clickhouseSettings: {
        type_json_skip_duplicated_paths: true,
      },
    });

    logger.info(
      `Successfully propagated observations from partition ${oldestPartition} to events table`,
    );

    // Step 4: Drop the processed partition
    await commandClickhouse({
      query: `
        ALTER TABLE observations_batch_staging
        DROP PARTITION '${oldestPartition}'
      `,
      tags: {
        feature: "ingestion",
        partition: oldestPartition,
        operation_name: "dropPartition",
      },
    });

    logger.info(
      `Dropped partition ${oldestPartition} after successful processing`,
    );

    // Schedule another job if we had more than 5 partitions remaining
    if (partitions.length > 5) {
      const queue = EventPropagationQueue.getInstance();
      if (queue) {
        await queue.add(
          QueueJobs.EventPropagationJob,
          { timestamp: new Date(), id: randomUUID() },
          { delay: 10000 }, // 10 second delay
        );
        logger.info(
          `Scheduled next event propagation job with 10s delay. Remaining partitions: ${partitions.length - 1}`,
        );
      }
    }
  } catch (error) {
    logger.error("Failed to process event propagation batch", error);
    traceException(error);
    throw error;
  }
};
