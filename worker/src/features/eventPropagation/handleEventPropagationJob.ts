import {
  queryClickhouse,
  commandClickhouse,
  getCurrentSpan,
  logger,
  QueueName,
  TQueueJobTypes,
  traceException,
  redis,
  recordGauge,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { env } from "../../env";

const LAST_PROCESSED_PARTITION_KEY =
  "langfuse:event-propagation:last-processed-partition";

/**
 * Get the last processed partition timestamp from Redis.
 * Returns null if no partition has been processed yet or if Redis is unavailable.
 */
export const getLastProcessedPartition = async (): Promise<string | null> => {
  try {
    return await redis!.get(LAST_PROCESSED_PARTITION_KEY);
  } catch (error) {
    logger.error("[DUAL WRITE] Failed to get last processed partition", error);
    return null;
  }
};

/**
 * Update the last processed partition timestamp in Redis.
 * This is called after successfully processing a partition.
 */
export const updateLastProcessedPartition = async (
  partition: string,
): Promise<void> => {
  try {
    await redis!.set(LAST_PROCESSED_PARTITION_KEY, partition);
    logger.info(
      `[DUAL WRITE] Updated last processed partition to ${partition}`,
    );
  } catch (error) {
    logger.error(
      "[DUAL WRITE] Failed to update last processed partition",
      error,
    );
    // Don't throw - allow processing to continue
  }
};

/**
 * Processes partitions from observations_batch_staging table and propagates
 * events to the events table. Uses cursor-based sequential processing to track
 * the last processed partition and always processes the next partition in order.
 * Relies on table TTL for partition cleanup instead of explicit DROP PARTITION.
 */
export const handleEventPropagationJob = async (
  job: Job<TQueueJobTypes[QueueName.EventPropagationQueue]>,
) => {
  getCurrentSpan()?.setAttribute(
    "messaging.bullmq.job.input.jobId",
    job.data.id,
  );

  if (env.LANGFUSE_EXPERIMENT_EARLY_EXIT_EVENT_BATCH_JOB === "true") {
    logger.info(
      "[DUAL WRITE] Early exit for event propagation job due to experiment flag",
    );
    return;
  }

  try {
    // Step 1: Get the last processed partition from Redis and find the next one to process
    const lastProcessedPartition = await getLastProcessedPartition();
    logger.info(
      `[DUAL WRITE] Last processed partition: ${lastProcessedPartition ?? "none"}`,
    );

    // Query for the next partition after the last processed one
    // Filter for partitions older than 6 minutes and order by partition ASC to get the oldest first
    const partitions = await queryClickhouse<{ partition: string }>({
      query: `
        SELECT DISTINCT partition
        FROM system.parts
        WHERE table = 'observations_batch_staging'
          AND active = 1
          AND toDateTime(partition) < now() - INTERVAL 10 MINUTE
          ${lastProcessedPartition ? `AND partition > {lastProcessedPartition: String}` : ""}
        ORDER BY partition ASC
      `,
      params: lastProcessedPartition ? { lastProcessedPartition } : undefined,
      tags: {
        feature: "ingestion",
        operation_name: "getNextPartition",
      },
    });

    recordGauge(
      "langfuse.event_propagation.partition_backlog",
      partitions.length,
    );

    if (partitions.length === 0) {
      logger.info(
        `[DUAL WRITE] No partitions available for processing (last processed: ${lastProcessedPartition ?? "none"})`,
      );
      return;
    }

    const partitionToProcess = partitions[0].partition;
    logger.info(
      `[DUAL WRITE] Processing partition ${partitionToProcess} for events table fill`,
    );

    // Step 2: Join observations_batch_staging with traces and insert into events
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
            groupUniqArray(trace_id) as trace_ids,
            min(start_time) as min_start_time,
            max(start_time) as max_start_time
          from observations_batch_staging
          where _partition_value = tuple('${partitionToProcess}')
        ), experiment_traces_to_exclude as (
          select distinct
            project_id,
            trace_id
          from dataset_run_items_rmt
          where project_id in (select arrayJoin(project_ids) from batch_stats)
            and created_at >= now() - interval 24 hour
        ), relevant_traces as (
          select
            t.id,
            t.project_id,
            t.name,
            t.user_id,
            t.session_id,
            t.version,
            t.release,
            t.tags,
            t.bookmarked,
            t.public,
            t.metadata
          from traces t
          where t.project_id in (select arrayJoin(project_ids) from batch_stats)
            and t.id in (select arrayJoin(trace_ids) from batch_stats)
            and t.timestamp >= (select min(min_start_time) - interval 1 day from batch_stats)
            and t.timestamp <= (select max(max_start_time) + interval 1 day from batch_stats)
          order by t.event_ts desc
          limit 1 by t.project_id, t.id
        )

        INSERT INTO events (
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
          release,
          tags,
          public,
          bookmarked,
          trace_name,
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
          usage_pricing_tier_id,
          usage_pricing_tier_name,
          tool_definitions,
          tool_calls,
          tool_call_names,

          input,
          output,
          metadata,
          metadata_names,
          metadata_raw_values,
          source,
          blob_storage_file_path,
          event_bytes,
          created_at,
          updated_at,
          event_ts,
          is_deleted
        )
        SELECT
          obs.project_id,
          obs.trace_id,
          obs.id AS span_id,
          -- When the observation IS the trace itself (id = trace_id), parent should be NULL
          -- Otherwise, use standard wrapper logic: parent_observation_id or prefixed trace_id as fallback
          CASE
            WHEN obs.id = concat('t-', obs.trace_id) THEN ''
            ELSE coalesce(obs.parent_observation_id, concat('t-', obs.trace_id))
          END AS parent_span_id,
          -- Convert timestamps from DateTime64(3) to DateTime64(6) via implicit conversion
          obs.start_time,
          obs.end_time,
          obs.name,
          obs.type,
          obs.environment,
          coalesce(obs.version, t.version) as version,
          coalesce(t.release, '') as release,
          t.tags as tags,
          t.public as public,
          t.bookmarked AND (obs.parent_observation_id IS NULL OR obs.parent_observation_id = '') AS bookmarked,
          t.name AS trace_name,
          coalesce(t.user_id, '') AS user_id,
          coalesce(t.session_id, '') AS session_id,
          obs.level,
          coalesce(obs.status_message, '') AS status_message,
          obs.completion_start_time,
          obs.prompt_id,
          obs.prompt_name,
          obs.prompt_version,
          obs.internal_model_id AS model_id,
          obs.provided_model_name,
          coalesce(obs.model_parameters, '{}'),
          obs.provided_usage_details,
          obs.usage_details,
          obs.provided_cost_details,
          obs.cost_details,
          obs.usage_pricing_tier_id,
          obs.usage_pricing_tier_name,
          obs.tool_definitions,
          obs.tool_calls,
          obs.tool_call_names,

          coalesce(obs.input, '') AS input,
          coalesce(obs.output, '') AS output,
          -- Merge trace and observation metadata, with observation taking precedence (first map wins)
          CAST(mapConcat(obs.metadata, coalesce(t.metadata, map())), 'JSON(max_dynamic_paths=0)') AS metadata,
          mapKeys(mapConcat(obs.metadata, coalesce(t.metadata, map()))) AS metadata_names,
          mapValues(mapConcat(obs.metadata, coalesce(t.metadata, map()))) AS metadata_raw_values,
          multiIf(mapContains(obs.metadata, 'resourceAttributes'), 'otel-dual-write', 'ingestion-api-dual-write') AS source,
          '' AS blob_storage_file_path,
          byteSize(*) AS event_bytes,
          obs.created_at,
          obs.updated_at,
          obs.event_ts,
          obs.is_deleted
        FROM observations_batch_staging obs FINAL
        LEFT JOIN relevant_traces t
        ON (
          obs.project_id = t.project_id AND
          obs.trace_id = t.id
        )
        LEFT ANTI JOIN experiment_traces_to_exclude excl
        ON (
          excl.project_id = obs.project_id AND
          excl.trace_id = obs.trace_id
        )
        WHERE obs._partition_value = tuple('${partitionToProcess}')
      `,
      tags: {
        feature: "ingestion",
        partition: partitionToProcess,
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
      `[DUAL WRITE] Successfully propagated observations from partition ${partitionToProcess} to events table`,
    );

    // Step 3: Update the last processed partition cursor in Redis
    // This allows the next job to continue from where we left off
    await updateLastProcessedPartition(partitionToProcess);
  } catch (error) {
    logger.error(
      "[DUAL WRITE] Failed to process event propagation batch",
      error,
    );
    traceException(error);
    throw error;
  }
};
