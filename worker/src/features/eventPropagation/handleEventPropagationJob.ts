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
  redis,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { env } from "../../env";
import { randomUUID } from "crypto";

const PARTITION_LOCK_PREFIX = "langfuse:partition-lock:event-propagation";

/**
 * Attempt to acquire a distributed lock for processing a specific partition.
 *
 * The lock automatically expires after the specified TTL to prevent stuck locks
 * if a worker crashes or fails to complete processing.
 */
export const acquirePartitionLock = async (
  partition: string,
  ttlSeconds: number = 300,
): Promise<boolean> => {
  if (!redis) {
    logger.warn(
      "[DUAL WRITE] Redis not available, skipping partition lock acquisition",
    );
    return true; // Allow processing if Redis is unavailable
  }

  try {
    // Sanitize partition string to be Redis key friendly
    const lockKey = `${PARTITION_LOCK_PREFIX}:${partition.replaceAll(/[^0-9_-]/g, "_")}`;

    // Returns "OK" if key was set (lock acquired), null if key already exists
    const result = await redis.set(lockKey, "true", "EX", ttlSeconds, "NX");
    const acquired = result === "OK";
    if (acquired) {
      logger.debug(
        `[DUAL WRITE] Acquired lock for partition ${partition} with TTL ${ttlSeconds}s`,
      );
    } else {
      logger.debug(
        `[DUAL WRITE] Partition ${partition} is already locked by another worker`,
      );
    }
    return acquired;
  } catch (error) {
    logger.error("[DUAL WRITE] Failed to acquire partition lock", error);
    // On error, allow processing to avoid blocking the system
    return true;
  }
};

/**
 * Check if a partition lock exists without acquiring it.
 *
 * Returns true if the partition is available (not locked), false if locked.
 * Used for scheduling follow-up jobs to avoid scheduling jobs for already-locked partitions.
 */
export const checkLock = async (partition: string): Promise<boolean> => {
  if (!redis) {
    logger.warn(
      "[DUAL WRITE] Redis not available, assuming partition is unlocked",
    );
    return true; // Allow processing if Redis is unavailable
  }

  try {
    // Sanitize partition string to be Redis key friendly (same as acquirePartitionLock)
    const lockKey = `${PARTITION_LOCK_PREFIX}:${partition.replaceAll(/[^0-9_-]/g, "_")}`;

    // Check if the lock key exists
    const exists = await redis.exists(lockKey);
    const isAvailable = exists === 0;

    if (isAvailable) {
      logger.debug(
        `[DUAL WRITE] Partition ${partition} is available (not locked)`,
      );
    } else {
      logger.debug(`[DUAL WRITE] Partition ${partition} is locked`);
    }

    return isAvailable;
  } catch (error) {
    logger.error("[DUAL WRITE] Failed to check partition lock", error);
    // On error, assume partition is available to avoid blocking the system
    return true;
  }
};

/**
 * Processes partitions from observations_batch_staging table and propagates
 * events to the events table. Supports both targeted partition processing
 * (when partition is specified in job data) and discovery mode (cron job).
 */
export const handleEventPropagationJob = async (
  job: Job<TQueueJobTypes[QueueName.EventPropagationQueue]>,
) => {
  const span = getCurrentSpan();
  const partition = job.data.payload?.partition;
  if (span) {
    span.setAttribute("messaging.bullmq.job.input.jobId", job.data.id);
    if (partition) {
      span.setAttribute("messaging.bullmq.job.input.partition", partition);
    }
  }

  if (env.LANGFUSE_EXPERIMENT_EARLY_EXIT_EVENT_BATCH_JOB === "true") {
    logger.info(
      "[DUAL WRITE] Early exit for event propagation job due to experiment flag",
    );
    return;
  }

  try {
    logger.debug("[DUAL WRITE] Starting event propagation batch processing", {
      jobId: job.data.id,
      partition: partition,
    });

    // Step 1: Get list of partitions ordered by time
    const partitions = await queryClickhouse<{ partition: string }>({
      query: `
        SELECT DISTINCT partition
        FROM system.parts
        WHERE table = 'observations_batch_staging'
          AND active = 1
        ORDER BY partition DESC
      `,
      tags: {
        feature: "ingestion",
        operation_name: "getPartitions",
      },
    });

    if (partitions.length < 3) {
      logger.info(
        `[DUAL WRITE] Not enough partitions for processing. Found ${partitions.length} partition(s), need at least 3`,
      );
      return;
    }

    // Determine which partition to process
    let partitionToProcess: string | null = null;
    if (partition) {
      // Try to acquire lock for this partition
      const lockAcquired = await acquirePartitionLock(partition);
      if (lockAcquired) {
        partitionToProcess = partition;
        logger.info(
          `[DUAL WRITE] Processing partition ${partitionToProcess} (targeted) for events table fill`,
        );
      } else {
        logger.info(
          `[DUAL WRITE] Partition ${partition} is already locked by another worker, falling back to discovery mode`,
        );
      }
    }

    // If no partition was processed yet (either no partition specified or it was locked),
    // fall back to discovery mode - process oldest safe partition
    if (!partitionToProcess) {
      // We sort partitions from newest to oldest and then remove elements from the back.
      // This means that the oldest, unlocked element will be processed.
      // Later, we can continue to process from the back until two elements remain.
      while (partitionToProcess === null && partitions.length > 2) {
        const internalPartition = partitions.pop()!;
        const lockAcquired = await acquirePartitionLock(
          internalPartition.partition,
        );
        if (!lockAcquired) {
          logger.debug(
            `[DUAL WRITE] Skipping partition ${internalPartition.partition} as it is locked by another worker`,
          );
          continue;
        }
        partitionToProcess = internalPartition.partition;
        logger.info(
          `[DUAL WRITE] Processing partition ${partitionToProcess} (discovery) for events table fill`,
        );
      }
    }

    if (!partitionToProcess) {
      logger.info(
        "[DUAL WRITE] No available partitions to process after checking locks, exiting",
      );
      return;
    }

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
        ), relevant_traces as (
          select
            t.id,
            t.project_id,
            t.user_id,
            t.session_id,
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
          -- Otherwise, use standard wrapper logic: parent_observation_id or prefixed trace_id as fallback
          CASE
            WHEN obs.id = obs.trace_id THEN NULL
            ELSE coalesce(obs.parent_observation_id, concat('t-', obs.trace_id))
          END AS parent_span_id,
          -- Convert timestamps from DateTime64(3) to DateTime64(6) via implicit conversion
          -- Clamp start_time to 1970-01-01 or later (Unix epoch minimum) to avoid toUnixTimestamp() errors
          greatest(obs.start_time, toDateTime64('1970-01-01', 3)) AS start_time,
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
          byteSize(*) AS event_bytes,
          obs.created_at,
          obs.updated_at,
          obs.event_ts,
          obs.is_deleted
        FROM relevant_traces t
        RIGHT JOIN observations_batch_staging obs FINAL
        ON (
          obs.project_id = t.project_id AND
          obs.trace_id = t.id
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

    // Step 3: DROP the processed partition without an await as this is a slow operation
    commandClickhouse({
      query: `
        ALTER TABLE observations_batch_staging
        DROP PARTITION '${partitionToProcess}'
      `,
      tags: {
        feature: "ingestion",
        partition: partitionToProcess,
        operation_name: "dropPartition",
      },
      clickhouseConfigs: {
        request_timeout: 60000 * 15, // 15 minutes timeout
      },
    })
      .then(() => {
        logger.info(
          `[DUAL WRITE] Successfully dropped partition ${partitionToProcess}`,
        );
      })
      .catch((error) => {
        logger.error(
          `[DUAL WRITE] Failed to drop partition ${partitionToProcess}`,
          error,
        );
        traceException(error);
      });

    logger.info(
      `[DUAL WRITE] Scheduled async drop for detached partition ${partitionToProcess}`,
    );

    if (partitions.length > 3) {
      let additionalSchedules =
        env.LANGFUSE_EVENT_PROPAGATION_WORKER_GLOBAL_CONCURRENCY;
      const queue = EventPropagationQueue.getInstance();
      while (queue && partitions.length > 3 && additionalSchedules > 0) {
        const internalPartition = partitions.pop()!;

        // Check if partition is locked before scheduling
        const isUnlocked = await checkLock(internalPartition.partition);
        if (!isUnlocked) {
          logger.debug(
            `[DUAL WRITE] Skipping scheduling for partition ${internalPartition.partition} as it is locked by another worker`,
          );
          continue;
        }

        additionalSchedules--;
        await queue.add(QueueJobs.EventPropagationJob, {
          timestamp: new Date(),
          id: randomUUID(),
          payload: {
            partition: internalPartition.partition,
          },
        });
        logger.info(
          `[DUAL WRITE] Scheduled additional event propagation job for partition ${internalPartition.partition}. ` +
            `Remaining partitions: ${partitions.length}`,
        );
      }
    }
  } catch (error) {
    logger.error(
      "[DUAL WRITE] Failed to process event propagation batch",
      error,
    );
    traceException(error);
    throw error;
  }
};
