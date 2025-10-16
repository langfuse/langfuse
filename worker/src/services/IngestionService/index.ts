import { Cluster, Redis } from "ioredis";
import { v4 } from "uuid";
import {
  Model,
  ObservationLevel,
  Price,
  PrismaClient,
  Prompt,
} from "@langfuse/shared";
import {
  ClickhouseClientType,
  convertDateToClickhouseDateTime,
  convertObservationReadToInsert,
  convertScoreReadToInsert,
  convertTraceReadToInsert,
  convertTraceToStagingObservation,
  eventTypes,
  IngestionEntityTypes,
  IngestionEventType,
  instrumentAsync,
  logger,
  ObservationEvent,
  observationRecordInsertSchema,
  ObservationRecordInsertType,
  observationRecordReadSchema,
  PromptService,
  QueueJobs,
  recordIncrement,
  ScoreEventType,
  DatasetRunItemEventType,
  scoreRecordInsertSchema,
  ScoreRecordInsertType,
  scoreRecordReadSchema,
  TraceEventType,
  traceRecordInsertSchema,
  TraceRecordInsertType,
  traceRecordReadSchema,
  TraceUpsertQueue,
  UsageCostType,
  findModel,
  validateAndInflateScore,
  DatasetRunItemRecordInsertType,
  EventRecordInsertType,
  hasNoJobConfigsCache,
  traceException,
} from "@langfuse/shared/src/server";

import { tokenCountAsync } from "../../features/tokenisation/async-usage";
import { tokenCount } from "../../features/tokenisation/usage";
import { ClickhouseWriter, TableName } from "../ClickhouseWriter";
import {
  convertJsonSchemaToRecord,
  convertPostgresJsonToMetadataRecord,
  convertRecordValuesToString,
  overwriteObject,
} from "./utils";
import { randomUUID } from "crypto";
import { SpanKind } from "@opentelemetry/api";
import { ClickhouseReadSkipCache } from "../../utils/clickhouseReadSkipCache";

type InsertRecord =
  | TraceRecordInsertType
  | ScoreRecordInsertType
  | ObservationRecordInsertType
  | DatasetRunItemRecordInsertType;

/**
 * Flexible input type for writing events to the events table.
 * This is intentionally loose to allow for iteration as the events
 * table schema evolves. Only required fields are enforced.
 */
export type EventInput = {
  // Required identifiers
  projectId: string;
  traceId: string;
  spanId: string;
  startTimeISO: string;

  // Optional identifiers
  orgId?: string;
  parentSpanId?: string;

  // Core properties
  name?: string;
  type?: string;
  environment?: string;
  version?: string;
  endTimeISO: string;
  completionStartTime?: string;

  // User/session
  userId?: string;
  sessionId?: string;
  level?: string;
  statusMessage?: string;

  // Prompt
  promptId?: string;
  promptName?: string;
  promptVersion?: string;

  // Model
  modelName?: string;
  modelParameters?: string;

  // Usage & Cost
  providedUsageDetails?: Record<string, number>;
  usageDetails?: Record<string, number>;
  providedCostDetails?: Record<string, number>;
  costDetails?: Record<string, number>;
  totalCost?: number;

  // I/O
  input?: string;
  output?: string;

  // Metadata
  // metadata can be a complex nested object with attributes, resourceAttributes, scopeAttributes, etc.
  metadata: Record<string, unknown>;

  // Source/instrumentation metadata
  source: string;
  serviceName?: string;
  serviceVersion?: string;
  scopeName?: string;
  scopeVersion?: string;
  telemetrySdkLanguage?: string;
  telemetrySdkName?: string;
  telemetrySdkVersion?: string;

  // Storage
  blobStorageFilePath?: string;
  eventRaw?: string;
  eventBytes?: number;

  // Catch-all for future fields
  [key: string]: any;
};

const immutableEntityKeys: {
  [TableName.Traces]: (keyof TraceRecordInsertType)[];
  [TableName.Scores]: (keyof ScoreRecordInsertType)[];
  [TableName.Observations]: (keyof ObservationRecordInsertType)[];
  [TableName.DatasetRunItems]: (keyof DatasetRunItemRecordInsertType)[];
} = {
  [TableName.Traces]: [
    "id",
    "project_id",
    "timestamp",
    "created_at",
    "environment",
  ],
  [TableName.Scores]: [
    "id",
    "project_id",
    "timestamp",
    "trace_id",
    "created_at",
    "environment",
  ],
  [TableName.Observations]: [
    "id",
    "project_id",
    "trace_id",
    "start_time",
    "created_at",
    "environment",
  ],
  // We do not accept updates, hence this list is currently not used.
  [TableName.DatasetRunItems]: [
    "id",
    "project_id",
    "dataset_run_id",
    "dataset_item_id",
    "dataset_id",
    "trace_id",
    "observation_id",
    "error",
    "created_at",
    "updated_at",
    "dataset_run_name",
    "dataset_run_description",
    "dataset_run_metadata",
    "dataset_run_created_at",
    "dataset_item_input",
    "dataset_item_expected_output",
    "dataset_item_metadata",
  ],
};

export class IngestionService {
  private promptService: PromptService;

  constructor(
    private redis: Redis | Cluster,
    private prisma: PrismaClient,
    private clickHouseWriter: ClickhouseWriter, // eslint-disable-line no-unused-vars
    private clickhouseClient: ClickhouseClientType, // eslint-disable-line no-unused-vars
  ) {
    this.promptService = new PromptService(prisma, redis);
  }

  public async mergeAndWrite(
    eventType: IngestionEntityTypes,
    projectId: string,
    eventBodyId: string,
    createdAtTimestamp: Date,
    events: IngestionEventType[],
    forwardToEventsTable: boolean,
  ): Promise<void> {
    logger.debug(
      `Merging ingestion ${eventType} event for project ${projectId} and event ${eventBodyId}`,
    );

    switch (eventType) {
      case "trace":
        return await this.processTraceEventList({
          projectId,
          entityId: eventBodyId,
          createdAtTimestamp,
          traceEventList: events as TraceEventType[],
          createEventTraceRecord: forwardToEventsTable,
        });
      case "observation":
        return await this.processObservationEventList({
          projectId,
          entityId: eventBodyId,
          createdAtTimestamp,
          observationEventList: events as ObservationEvent[],
          writeToStagingTables: forwardToEventsTable,
        });
      case "score": {
        return await this.processScoreEventList({
          projectId,
          entityId: eventBodyId,
          createdAtTimestamp,
          scoreEventList: events as ScoreEventType[],
        });
      }
      case "dataset_run_item": {
        return await this.processDatasetRunItemEventList({
          projectId,
          entityId: eventBodyId,
          createdAtTimestamp,
          datasetRunItemEventList: events as DatasetRunItemEventType[],
        });
      }
    }
  }

  /**
   * Writes a single event directly to the events table.
   * Unlike other ingestion methods, this does not perform merging since
   * events are immutable and written once.
   *
   * @param eventData - The event data to write
   * @param fileKey - The file key where the raw event data is stored
   */
  public async writeEvent(
    eventData: EventInput,
    fileKey: string,
  ): Promise<void> {
    logger.debug(
      `Writing event for project ${eventData.projectId} and span ${eventData.spanId}`,
    );

    const now = this.getMicrosecondTimestamp();

    // Store the full metadata JSON
    const metadata = eventData.metadata;

    // Flatten to path-based arrays
    const flattened = this.flattenJsonToPathArrays(metadata);
    const metadataNames = flattened.names;
    const metadataValues = flattened.values;

    // Flatten to typed arrays
    const typed = this.flattenJsonToTypedPathArrays(metadata);
    const metadataStringNames = typed.stringNames;
    const metadataStringValues = typed.stringValues;
    const metadataNumberNames = typed.numberNames;
    const metadataNumberValues = typed.numberValues;
    const metadataBoolNames = typed.boolNames;
    const metadataBoolValues = typed.boolValues;

    const eventRecord: EventRecordInsertType = {
      // Required identifiers
      id: eventData.spanId,
      project_id: eventData.projectId,
      trace_id: eventData.traceId,
      span_id: eventData.spanId,

      // Optional identifiers
      parent_span_id: eventData.parentSpanId,

      // Core properties with defaults
      name: eventData.name ?? "",
      type: eventData.type ?? "SPAN",
      environment: eventData.environment ?? "default",
      version: eventData.version,

      // User/session
      user_id: eventData.userId,
      session_id: eventData.sessionId,

      // Status
      level: eventData.level ?? "DEFAULT",
      status_message: eventData.statusMessage,

      // Timestamps
      start_time: this.getMicrosecondTimestamp(eventData.startTimeISO),
      end_time: this.getMicrosecondTimestamp(eventData.endTimeISO),
      completion_start_time: eventData.completionStartTime
        ? this.getMicrosecondTimestamp(eventData.completionStartTime)
        : null,

      // Prompt
      // prompt_id: eventData.promptId,
      prompt_name: eventData.promptName,
      prompt_version: eventData.promptVersion,

      // Model
      // model_id: eventData.modelId,
      provided_model_name: eventData.modelName,
      model_parameters: eventData.modelParameters,

      // Usage & Cost
      // provided_usage_details: eventData.providedUsageDetails ?? {},
      // usage_details: eventData.usageDetails ?? {},
      // provided_cost_details: eventData.providedCostDetails ?? {},
      // cost_details: eventData.costDetails ?? {},
      // total_cost: eventData.totalCost,

      // I/O
      input: eventData.input,
      output: eventData.output,

      // Metadata (multiple approaches)
      metadata,
      metadata_names: metadataNames,
      metadata_values: metadataValues,
      metadata_string_names: metadataStringNames,
      metadata_string_values: metadataStringValues,
      metadata_number_names: metadataNumberNames,
      metadata_number_values: metadataNumberValues,
      metadata_bool_names: metadataBoolNames,
      metadata_bool_values: metadataBoolValues,

      // Source/instrumentation metadata
      source: eventData.source,
      service_name: eventData.serviceName,
      service_version: eventData.serviceVersion,
      scope_name: eventData.scopeName,
      scope_version: eventData.scopeVersion,
      telemetry_sdk_language: eventData.telemetrySdkLanguage,
      telemetry_sdk_name: eventData.telemetrySdkName,
      telemetry_sdk_version: eventData.telemetrySdkVersion,

      // Storage
      blob_storage_file_path: fileKey,
      // event_raw: eventData.eventRaw ?? "",
      event_bytes: eventData.eventBytes ?? 0,

      // System timestamps
      created_at: now,
      updated_at: now,
      event_ts: now,
      is_deleted: 0,
    } as any;

    // Write directly to ClickHouse queue (no merging for immutable events)
    this.clickHouseWriter.addToQueue(TableName.Events, eventRecord);
  }

  private async processDatasetRunItemEventList(params: {
    projectId: string;
    entityId: string;
    createdAtTimestamp: Date;
    datasetRunItemEventList: DatasetRunItemEventType[];
  }) {
    const { projectId, entityId, datasetRunItemEventList } = params;
    if (datasetRunItemEventList.length === 0) return;

    const finalDatasetRunItemRecords: DatasetRunItemRecordInsertType[] = (
      await Promise.all(
        datasetRunItemEventList.map(
          async (
            event: DatasetRunItemEventType,
          ): Promise<DatasetRunItemRecordInsertType[]> => {
            const [runData, itemData] = await Promise.all([
              this.prisma.datasetRuns.findFirst({
                where: {
                  id: event.body.runId,
                  datasetId: event.body.datasetId,
                  projectId,
                },
                select: {
                  name: true,
                  description: true,
                  metadata: true,
                  createdAt: true,
                },
              }),
              this.prisma.datasetItem.findFirst({
                where: {
                  datasetId: event.body.datasetId,
                  projectId,
                  id: event.body.datasetItemId,
                  status: "ACTIVE",
                },
                select: {
                  input: true,
                  expectedOutput: true,
                  metadata: true,
                },
              }),
            ]);

            if (!runData || !itemData) return [];

            const timestamp = event.body.createdAt
              ? new Date(event.body.createdAt).getTime()
              : new Date().getTime();

            return [
              {
                id: entityId,
                project_id: projectId,
                dataset_run_id: event.body.runId,
                dataset_item_id: event.body.datasetItemId,
                dataset_id: event.body.datasetId,
                trace_id: event.body.traceId,
                observation_id: event.body.observationId,
                error: event.body.error,
                created_at: timestamp,
                updated_at: timestamp,
                event_ts: timestamp,
                is_deleted: 0,
                // enriched with run data
                dataset_run_name: runData.name,
                dataset_run_description: runData.description,
                dataset_run_metadata: runData.metadata
                  ? convertPostgresJsonToMetadataRecord(runData.metadata)
                  : {},
                dataset_run_created_at: runData.createdAt.getTime(),
                // enriched with item data
                dataset_item_input: JSON.stringify(itemData.input),
                dataset_item_expected_output: JSON.stringify(
                  itemData.expectedOutput,
                ),
                dataset_item_metadata: itemData.metadata
                  ? convertPostgresJsonToMetadataRecord(itemData.metadata)
                  : {},
              },
            ];
          },
        ),
      )
    ).flat();

    finalDatasetRunItemRecords.forEach((record) => {
      if (record) {
        this.clickHouseWriter.addToQueue(TableName.DatasetRunItems, record);
      }
    });
  }

  private async processScoreEventList(params: {
    projectId: string;
    entityId: string;
    createdAtTimestamp: Date;
    scoreEventList: ScoreEventType[];
  }) {
    const { projectId, entityId, createdAtTimestamp, scoreEventList } = params;
    if (scoreEventList.length === 0) return;

    const timeSortedEvents =
      IngestionService.toTimeSortedEventList(scoreEventList);

    const minTimestamp = Math.min(
      ...timeSortedEvents.flatMap((e) =>
        e.timestamp ? [new Date(e.timestamp).getTime()] : [],
      ),
    );
    const timestamp =
      minTimestamp === Infinity
        ? undefined
        : convertDateToClickhouseDateTime(new Date(minTimestamp));
    const [clickhouseScoreRecord, scoreRecords] = await Promise.all([
      this.getClickhouseRecord({
        projectId,
        entityId,
        table: TableName.Scores,
        additionalFilters: {
          whereCondition: timestamp
            ? " AND timestamp >= {timestamp: DateTime64(3)} "
            : "",
          params: { timestamp },
        },
      }),
      Promise.all(
        timeSortedEvents.map(async (scoreEvent) => {
          try {
            const validatedScore = await validateAndInflateScore({
              body: scoreEvent.body,
              scoreId: entityId,
              projectId,
            });

            return {
              id: entityId,
              project_id: projectId,
              environment: validatedScore.environment,
              timestamp: this.getMillisecondTimestamp(scoreEvent.timestamp),
              name: validatedScore.name,
              value: validatedScore.value,
              source: validatedScore.source,
              trace_id: validatedScore.traceId,
              session_id: validatedScore.sessionId,
              dataset_run_id: validatedScore.datasetRunId,
              data_type: validatedScore.dataType,
              observation_id: validatedScore.observationId,
              config_id: validatedScore.configId,
              comment: validatedScore.comment,
              metadata: scoreEvent.body.metadata
                ? convertJsonSchemaToRecord(scoreEvent.body.metadata)
                : {},
              string_value: validatedScore.stringValue,
              execution_trace_id: validatedScore.executionTraceId,
              queue_id: validatedScore.queueId ?? null,
              created_at: Date.now(),
              updated_at: Date.now(),
              event_ts: new Date(scoreEvent.timestamp).getTime(),
              is_deleted: 0,
            };
            // Gracefully handle any score schema validation errors, skip the score insert and reject silently.
          } catch (error) {
            logger.info(
              `Failed to validate and enrich score body for project: ${projectId} and score: ${entityId}`,
              error,
            );
            return null;
          }
        }),
      ).then((results) =>
        results.filter(
          (record): record is NonNullable<typeof record> => record !== null,
        ),
      ),
    ]);

    if (clickhouseScoreRecord) {
      recordIncrement("langfuse.ingestion.lookup.hit", 1, {
        store: "clickhouse",
        object: "score",
      });
    }

    const finalScoreRecord: ScoreRecordInsertType =
      await this.mergeScoreRecords({
        clickhouseScoreRecord,
        scoreRecords,
      });
    finalScoreRecord.created_at =
      clickhouseScoreRecord?.created_at ?? createdAtTimestamp.getTime();

    this.clickHouseWriter.addToQueue(TableName.Scores, finalScoreRecord);
  }

  private async processTraceEventList(params: {
    projectId: string;
    entityId: string;
    createdAtTimestamp: Date;
    traceEventList: TraceEventType[];
    createEventTraceRecord: boolean;
  }) {
    const {
      projectId,
      entityId,
      createdAtTimestamp,
      traceEventList,
      createEventTraceRecord,
    } = params;
    if (traceEventList.length === 0) return;

    const timeSortedEvents =
      IngestionService.toTimeSortedEventList(traceEventList);

    const traceRecords = this.mapTraceEventsToRecords({
      projectId,
      entityId,
      traceEventList: timeSortedEvents,
    });

    // Search for the first non-null input and output in the trace events and set them on the merged result.
    // Fallback to the ClickHouse input/output if none are found within the events list.
    const reversedRawRecords = timeSortedEvents.slice().reverse();
    const finalIO = {
      input: this.stringify(
        reversedRawRecords.find((record) => record?.body?.input)?.body?.input,
      ),
      output: this.stringify(
        reversedRawRecords.find((record) => record?.body?.output)?.body?.output,
      ),
    };

    const minTimestamp = Math.min(
      ...timeSortedEvents.flatMap((e) =>
        e.body?.timestamp ? [new Date(e.body.timestamp).getTime()] : [],
      ),
    );
    const timestamp =
      minTimestamp === Infinity
        ? undefined
        : convertDateToClickhouseDateTime(new Date(minTimestamp));
    const clickhouseTraceRecord = await this.getClickhouseRecord({
      projectId,
      entityId,
      table: TableName.Traces,
      additionalFilters: {
        whereCondition: timestamp
          ? " AND timestamp >= {timestamp: DateTime64(3)} "
          : "",
        params: { timestamp },
      },
    });

    if (clickhouseTraceRecord) {
      recordIncrement("langfuse.ingestion.lookup.hit", 1, {
        store: "clickhouse",
        object: "trace",
      });
    }

    const finalTraceRecord = await this.mergeTraceRecords({
      clickhouseTraceRecord,
      traceRecords,
    });
    finalTraceRecord.created_at =
      clickhouseTraceRecord?.created_at ?? createdAtTimestamp.getTime();

    finalTraceRecord.input = finalIO.input ?? clickhouseTraceRecord?.input;
    finalTraceRecord.output = finalIO.output ?? clickhouseTraceRecord?.output;

    this.clickHouseWriter.addToQueue(TableName.Traces, finalTraceRecord);

    // If the trace has a sessionId, we upsert the corresponding session into Postgres.
    const traceRecordWithSession = traceRecords
      .slice()
      .reverse()
      .find((t) => t.session_id);
    if (traceRecordWithSession) {
      try {
        await this.prisma.$executeRaw`
          INSERT INTO trace_sessions (id, project_id, environment, created_at, updated_at)
          VALUES (${traceRecordWithSession.session_id}, ${projectId}, ${traceRecordWithSession.environment}, NOW(), NOW())
          ON CONFLICT (id, project_id)
          DO NOTHING
        `;
      } catch (e) {
        logger.error(
          `Failed to upsert session ${traceRecordWithSession.session_id}`,
          e,
        );
        throw e;
      }
    }

    // Dual-write to staging table for batch propagation to events table
    // We pretend the trace is a "span" where span_id = trace_id
    if (createEventTraceRecord) {
      const traceAsStagingObservation = convertTraceToStagingObservation(
        finalTraceRecord,
        createdAtTimestamp.getTime(),
      );
      this.clickHouseWriter.addToQueue(
        TableName.ObservationsBatchStaging,
        traceAsStagingObservation,
      );
    }

    // Add trace into trace upsert queue for eval processing
    // First check if we already know this project has no job configurations
    const hasNoJobConfigs = await hasNoJobConfigsCache(projectId);
    if (hasNoJobConfigs) {
      logger.debug(
        `Skipping TraceUpsert queue for project ${projectId} - no job configs cached`,
      );
      return;
    } else {
      // Job configs present, so we add to the TraceUpsert queue.
      const shardingKey = `${projectId}-${entityId}`;
      const traceUpsertQueue = TraceUpsertQueue.getInstance({ shardingKey });
      if (!traceUpsertQueue) {
        logger.error("TraceUpsertQueue is not initialized");
        return;
      }
      await traceUpsertQueue.add(QueueJobs.TraceUpsert, {
        payload: {
          projectId,
          traceId: entityId,
          exactTimestamp: new Date(finalTraceRecord.timestamp),
          traceEnvironment: finalTraceRecord.environment,
        },
        id: randomUUID(),
        timestamp: new Date(),
        name: QueueJobs.TraceUpsert as const,
      });
    }
  }

  private async processObservationEventList(params: {
    projectId: string;
    entityId: string;
    createdAtTimestamp: Date;
    observationEventList: ObservationEvent[];
    writeToStagingTables: boolean;
  }) {
    const {
      projectId,
      entityId,
      createdAtTimestamp,
      observationEventList,
      writeToStagingTables,
    } = params;
    if (observationEventList.length === 0) return;

    const timeSortedEvents =
      IngestionService.toTimeSortedEventList(observationEventList);

    const type = this.getObservationType(observationEventList[0]);
    const minStartTime = Math.min(
      ...observationEventList.flatMap((e) =>
        e.body?.startTime ? [new Date(e.body.startTime).getTime()] : [],
      ),
    );
    const startTime =
      minStartTime === Infinity
        ? undefined
        : convertDateToClickhouseDateTime(new Date(minStartTime));

    const [clickhouseObservationRecord, prompt] = await Promise.all([
      this.getClickhouseRecord({
        projectId,
        entityId,
        table: TableName.Observations,
        additionalFilters: {
          whereCondition: `AND type = {type: String} ${startTime ? "AND start_time >= {startTime: DateTime64(3)} " : ""}`,
          params: {
            type,
            startTime,
          },
        },
      }),
      this.getPrompt(projectId, observationEventList),
    ]);

    if (clickhouseObservationRecord) {
      recordIncrement("langfuse.ingestion.lookup.hit", 1, {
        store: "clickhouse",
        object: "observation",
      });
    }

    const observationRecords = this.mapObservationEventsToRecords({
      observationEventList: timeSortedEvents,
      projectId,
      entityId,
      prompt,
    });

    const mergedObservationRecord = await this.mergeObservationRecords({
      projectId,
      observationRecords,
      clickhouseObservationRecord,
    });
    mergedObservationRecord.created_at =
      clickhouseObservationRecord?.created_at ?? createdAtTimestamp.getTime();
    mergedObservationRecord.level = mergedObservationRecord.level ?? "DEFAULT";

    // Search for the first non-null input and output in the observation events and set them on the merged result.
    // Fallback to the ClickHouse input/output if none are found within the events list.
    const reversedRawRecords = timeSortedEvents.slice().reverse();
    mergedObservationRecord.input = this.stringify(
      reversedRawRecords.find((record) => record?.body?.input)?.body?.input ??
        clickhouseObservationRecord?.input,
    );
    mergedObservationRecord.output = this.stringify(
      reversedRawRecords.find((record) => record?.body?.output)?.body?.output ??
        clickhouseObservationRecord?.output,
    );

    const generationUsage = await this.getGenerationUsage({
      projectId,
      observationRecord: mergedObservationRecord,
    });
    const finalObservationRecord = {
      ...mergedObservationRecord,
      ...generationUsage,
    };

    // Backward compat: create wrapper trace for SDK < 2.0.0 events that do not have a traceId
    if (!finalObservationRecord.trace_id) {
      const wrapperTraceRecord: TraceRecordInsertType = {
        id: finalObservationRecord.id,
        timestamp: finalObservationRecord.start_time,
        project_id: projectId,
        environment: finalObservationRecord.environment,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {},
        tags: [],
        bookmarked: false,
        public: false,
        event_ts: Date.now(),
        is_deleted: 0,
      };

      this.clickHouseWriter.addToQueue(TableName.Traces, wrapperTraceRecord);
      finalObservationRecord.trace_id = finalObservationRecord.id;
    }

    this.clickHouseWriter.addToQueue(
      TableName.Observations,
      finalObservationRecord,
    );

    // Dual-write to staging table for batch propagation to events table
    if (writeToStagingTables) {
      const stagingRecord = {
        ...finalObservationRecord,
        s3_first_seen_timestamp: createdAtTimestamp.getTime(),
      };
      this.clickHouseWriter.addToQueue(
        TableName.ObservationsBatchStaging,
        stagingRecord,
      );
    }
  }

  private async mergeScoreRecords(params: {
    scoreRecords: ScoreRecordInsertType[];
    clickhouseScoreRecord?: ScoreRecordInsertType | null;
  }): Promise<ScoreRecordInsertType> {
    const { scoreRecords, clickhouseScoreRecord } = params;

    // Set clickhouse first as this is the baseline for immutable fields
    const recordsToMerge = [clickhouseScoreRecord, ...scoreRecords].filter(
      Boolean,
    ) as ScoreRecordInsertType[];

    const mergedRecord = this.mergeRecords(
      recordsToMerge,
      immutableEntityKeys[TableName.Scores],
    );

    // If metadata exists, it is an object due to previous parsing
    mergedRecord.metadata = convertRecordValuesToString(
      (mergedRecord.metadata as Record<string, unknown>) ?? {},
    );

    return scoreRecordInsertSchema.parse(mergedRecord);
  }

  private async mergeTraceRecords(params: {
    traceRecords: TraceRecordInsertType[];
    clickhouseTraceRecord?: TraceRecordInsertType | null;
  }): Promise<TraceRecordInsertType> {
    const { traceRecords, clickhouseTraceRecord } = params;

    // Set clickhouse first as this is the baseline for immutable fields
    const recordsToMerge = [clickhouseTraceRecord, ...traceRecords].filter(
      Boolean,
    ) as TraceRecordInsertType[];

    const mergedRecord = this.mergeRecords(
      recordsToMerge,
      immutableEntityKeys[TableName.Traces],
    );

    // If metadata exists, it is an object due to previous parsing
    mergedRecord.metadata = convertRecordValuesToString(
      (mergedRecord.metadata as Record<string, unknown>) ?? {},
    );

    return traceRecordInsertSchema.parse(mergedRecord);
  }

  private async mergeObservationRecords(params: {
    projectId: string;
    observationRecords: ObservationRecordInsertType[];
    clickhouseObservationRecord?: ObservationRecordInsertType | null;
  }): Promise<ObservationRecordInsertType> {
    const { observationRecords, clickhouseObservationRecord } = params;

    // Set clickhouse first as this is the baseline for immutable fields
    const recordsToMerge = [
      clickhouseObservationRecord,
      ...observationRecords,
    ].filter(Boolean) as ObservationRecordInsertType[];

    const mergedRecord = this.mergeRecords(
      recordsToMerge,
      immutableEntityKeys[TableName.Observations],
    );

    // If metadata exists, it is an object due to previous parsing
    mergedRecord.metadata = convertRecordValuesToString(
      (mergedRecord.metadata as Record<string, unknown>) ?? {},
    );

    const parsedObservationRecord =
      observationRecordInsertSchema.parse(mergedRecord);

    // Override endTimes that are before startTimes with the startTime
    if (
      parsedObservationRecord.end_time &&
      parsedObservationRecord.end_time < parsedObservationRecord.start_time
    ) {
      parsedObservationRecord.end_time = parsedObservationRecord.start_time;
    }

    return parsedObservationRecord;
  }

  private mergeRecords<T extends InsertRecord>(
    records: T[],
    immutableEntityKeys: string[],
  ): Record<string, unknown> {
    if (records.length === 0) {
      throw new Error("No records to merge");
    }

    let result: {
      id: string;
      project_id: string;
      [key: string]: any;
    } = { id: records[0].id, project_id: records[0].project_id };

    for (const record of records) {
      result = overwriteObject(result, record, immutableEntityKeys);
    }

    result.event_ts = new Date().getTime();

    return result;
  }

  private static toTimeSortedEventList<
    T extends TraceEventType | ScoreEventType | ObservationEvent,
  >(eventList: T[]): T[] {
    return eventList.slice().sort((a, b) => {
      const aTimestamp = new Date(a.timestamp).getTime();
      const bTimestamp = new Date(b.timestamp).getTime();

      if (aTimestamp === bTimestamp) {
        return a.type.includes("create") ? -1 : 1; // create events should come first
      }

      return aTimestamp - bTimestamp;
    });
  }

  private async getPrompt(
    projectId: string,
    observationEventList: ObservationEvent[],
  ): Promise<ObservationPrompt | null> {
    const lastObservationWithPromptInfo = observationEventList
      .slice()
      .reverse()
      .find(this.hasPromptInformation);

    if (!lastObservationWithPromptInfo) return null;

    const { promptName, promptVersion: version } =
      lastObservationWithPromptInfo.body;

    return this.promptService.getPrompt({
      projectId,
      promptName,
      version,
      label: undefined,
    });
  }

  private hasPromptInformation(
    event: ObservationEvent,
  ): event is ObservationEvent & {
    body: { promptName: string; promptVersion: number };
  } {
    return (
      "promptName" in event.body &&
      typeof event.body.promptName === "string" &&
      "promptVersion" in event.body &&
      typeof event.body.promptVersion === "number"
    );
  }

  private async getGenerationUsage(params: {
    projectId: string;
    observationRecord: ObservationRecordInsertType;
  }): Promise<
    | Pick<
        ObservationRecordInsertType,
        "usage_details" | "cost_details" | "total_cost" | "internal_model_id"
      >
    | {}
  > {
    const { projectId, observationRecord } = params;
    const { model: internalModel, prices: modelPrices } =
      observationRecord.provided_model_name
        ? await findModel({
            projectId,
            model: observationRecord.provided_model_name,
          })
        : { model: null, prices: [] };

    const final_usage_details = await this.getUsageUnits(
      observationRecord,
      internalModel,
    );

    const final_cost_details = IngestionService.calculateUsageCosts(
      modelPrices,
      observationRecord,
      final_usage_details.usage_details ?? {},
    );

    logger.debug(
      `Calculated costs and usage for observation ${observationRecord.id} with model ${internalModel?.id}`,
      {
        cost: final_cost_details.cost_details,
        usage: final_usage_details.usage_details,
      },
    );

    return {
      ...final_usage_details,
      ...final_cost_details,
      internal_model_id: internalModel?.id,
    };
  }

  private async getUsageUnits(
    observationRecord: ObservationRecordInsertType,
    model: Model | null | undefined,
  ): Promise<
    Pick<
      ObservationRecordInsertType,
      "usage_details" | "provided_usage_details"
    >
  > {
    const providedUsageDetails = Object.fromEntries(
      Object.entries(observationRecord.provided_usage_details).filter(
        ([k, v]) => v != null && v >= 0, // eslint-disable-line no-unused-vars
      ),
    );

    if (
      // Manual tokenisation when no user provided usage and generation has not status ERROR
      model &&
      Object.keys(providedUsageDetails).length === 0 &&
      observationRecord.level !== ObservationLevel.ERROR
    ) {
      try {
        let newInputCount: number | undefined;
        let newOutputCount: number | undefined;
        await instrumentAsync(
          {
            name: "token-count",
          },
          async (span) => {
            try {
              [newInputCount, newOutputCount] = await Promise.all([
                tokenCountAsync({
                  text: observationRecord.input,
                  model,
                }),
                tokenCountAsync({
                  text: observationRecord.output,
                  model,
                }),
              ]);
            } catch (error) {
              logger.warn(
                `Async tokenization has failed. Falling back to synchronous tokenization`,
                error,
              );
              newInputCount = tokenCount({
                text: observationRecord.input,
                model,
              });
              newOutputCount = tokenCount({
                text: observationRecord.output,
                model,
              });
            }

            // Tracing
            newInputCount
              ? span.setAttribute(
                  "langfuse.tokenization.input-count",
                  newInputCount,
                )
              : undefined;
            newOutputCount
              ? span.setAttribute(
                  "langfuse.tokenization.output-count",
                  newOutputCount,
                )
              : undefined;
            newInputCount || newOutputCount
              ? span.setAttribute(
                  "langfuse.tokenization.tokenizer",
                  model.tokenizerId || "unknown",
                )
              : undefined;
            newInputCount
              ? recordIncrement("langfuse.tokenisedTokens", newInputCount)
              : undefined;
            newOutputCount
              ? recordIncrement("langfuse.tokenisedTokens", newOutputCount)
              : undefined;
          },
        );

        logger.debug(
          `Tokenized observation ${observationRecord.id} with model ${model.id}, input: ${newInputCount}, output: ${newOutputCount}`,
        );

        const newTotalCount =
          newInputCount || newOutputCount
            ? (newInputCount ?? 0) + (newOutputCount ?? 0)
            : undefined;

        const usage_details: Record<string, number> = {};

        if (newInputCount != null) usage_details.input = newInputCount;
        if (newOutputCount != null) usage_details.output = newOutputCount;
        if (newTotalCount != null) usage_details.total = newTotalCount;

        return { usage_details, provided_usage_details: providedUsageDetails };
      } catch (error) {
        traceException(error);
        logger.error(
          `Tokenization failed for observation ${observationRecord.id} with model ${model.id}. Continuing without token counts.`,
          error,
        );
        // Continue without token counts - return empty usage_details
        return {
          usage_details: {},
          provided_usage_details: providedUsageDetails,
        };
      }
    }

    const usageDetails = { ...providedUsageDetails };
    if (Object.keys(usageDetails).length > 0 && !("total" in usageDetails)) {
      usageDetails.total = Object.values(providedUsageDetails).reduce(
        (acc, value) => acc + value,
        0,
      );
    }

    return {
      usage_details: usageDetails,
      provided_usage_details: providedUsageDetails,
    };
  }

  static calculateUsageCosts(
    modelPrices: Price[] | null | undefined,
    observationRecord: ObservationRecordInsertType,
    usageUnits: UsageCostType,
  ): Pick<ObservationRecordInsertType, "cost_details" | "total_cost"> {
    const { provided_cost_details } = observationRecord;

    const providedCostKeys = Object.entries(provided_cost_details ?? {})
      .filter(([_, value]) => value != null) // eslint-disable-line no-unused-vars
      .map(([key]) => key);

    // If user has provided any cost point, do not calculate any other cost points
    if (providedCostKeys.length) {
      const cost_details = { ...provided_cost_details };
      const finalTotalCost =
        (provided_cost_details ?? {})["total"] ??
        // Use provided input and output cost if available, but only if no other cost points are provided
        (providedCostKeys.every((key) => ["input", "output"].includes(key))
          ? ((provided_cost_details ?? {})["input"] ?? 0) +
            ((provided_cost_details ?? {})["output"] ?? 0)
          : undefined);

      if (
        !Object.prototype.hasOwnProperty.call(cost_details, "total") &&
        finalTotalCost != null
      ) {
        cost_details.total = finalTotalCost;
      }

      return {
        cost_details,
        total_cost: finalTotalCost,
      };
    }

    const finalCostEntries: [string, number][] = [];

    for (const [key, units] of Object.entries(usageUnits)) {
      const price = modelPrices?.find((price) => price.usageType === key);

      if (units != null && price) {
        finalCostEntries.push([key, price.price.mul(units).toNumber()]);
      }
    }

    const finalCostDetails = Object.fromEntries(finalCostEntries);

    let finalTotalCost;
    if (
      Object.prototype.hasOwnProperty.call(finalCostDetails, "total") &&
      finalCostDetails.total != null
    ) {
      finalTotalCost = finalCostDetails.total;
    } else if (finalCostEntries.length > 0) {
      finalTotalCost = finalCostEntries.reduce(
        (acc, [_, cost]) => acc + cost, // eslint-disable-line no-unused-vars
        0,
      );

      finalCostDetails.total = finalTotalCost;
    }

    return {
      cost_details: finalCostDetails,
      total_cost: finalTotalCost,
    };
  }

  // eslint-disable-next-line no-unused-vars
  private async getClickhouseRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName.Traces;
    additionalFilters: {
      whereCondition: string;
      params: Record<string, unknown>;
    };
  }): Promise<TraceRecordInsertType | null>;
  // eslint-disable-next-line no-unused-vars, no-dupe-class-members
  private async getClickhouseRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName.Scores;
    additionalFilters: {
      whereCondition: string;
      params: Record<string, unknown>;
    };
  }): Promise<ScoreRecordInsertType | null>;
  // eslint-disable-next-line no-unused-vars, no-dupe-class-members
  private async getClickhouseRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName.Observations;
    additionalFilters: {
      whereCondition: string;
      params: Record<string, unknown>;
    };
  }): Promise<ObservationRecordInsertType | null>;
  // eslint-disable-next-line no-dupe-class-members
  private async getClickhouseRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName;
    additionalFilters: {
      whereCondition: string;
      params: Record<string, unknown>;
    };
  }) {
    if (
      await ClickhouseReadSkipCache.getInstance(
        this.prisma,
      ).shouldSkipClickHouseRead(params.projectId)
    ) {
      recordIncrement("langfuse.ingestion.clickhouse_read_for_update", 1, {
        skipped: "true",
        table: params.table,
      });
      return null;
    }
    recordIncrement("langfuse.ingestion.clickhouse_read_for_update", 1, {
      skipped: "false",
      table: params.table,
    });

    const recordParser = {
      traces: traceRecordReadSchema,
      scores: scoreRecordReadSchema,
      observations: observationRecordReadSchema,
    };
    const { projectId, entityId, table, additionalFilters } = params;

    return await instrumentAsync(
      { name: `get-clickhouse-${table}`, spanKind: SpanKind.CLIENT },
      async (span) => {
        span.setAttribute("ch.query.table", table);
        span.setAttribute("db.system", "clickhouse");
        span.setAttribute("db.operation.name", "SELECT");
        span.setAttribute("projectId", projectId);
        const queryResult = await this.clickhouseClient.query({
          query: `
            SELECT *
            FROM ${table}
            WHERE project_id = {projectId: String}
            AND id = {entityId: String}
            ${additionalFilters.whereCondition}
            ORDER BY event_ts DESC
            LIMIT 1 BY id, project_id SETTINGS use_query_cache = false;
          `,
          format: "JSONEachRow",
          query_params: { projectId, entityId, ...additionalFilters.params },
          clickhouse_settings: {
            log_comment: JSON.stringify({
              feature: "ingestion",
              projectId,
            }),
          },
        });

        span.setAttribute("ch.queryId", queryResult.query_id);
        const summaryHeader =
          queryResult.response_headers["x-clickhouse-summary"];
        if (summaryHeader) {
          try {
            const summary = Array.isArray(summaryHeader)
              ? JSON.parse(summaryHeader[0])
              : JSON.parse(summaryHeader);
            for (const key in summary) {
              span.setAttribute(`ch.${key}`, summary[key]);
            }
          } catch (error) {
            logger.debug(
              `Failed to parse clickhouse summary header ${summaryHeader}`,
              error,
            );
          }
        }

        const result = await queryResult.json();

        if (result.length === 0) return null;

        switch (table) {
          case TableName.Traces:
            return convertTraceReadToInsert(
              recordParser[table].parse(result[0]),
            );
          case TableName.Scores:
            return convertScoreReadToInsert(
              recordParser[table].parse(result[0]),
            );
          case TableName.Observations:
            return convertObservationReadToInsert(
              recordParser[table].parse(result[0]),
            );
          default:
            throw new Error(`Unsupported table name: ${table}`);
        }
      },
    );
  }

  private mapTraceEventsToRecords(params: {
    traceEventList: TraceEventType[];
    projectId: string;
    entityId: string;
  }) {
    const { traceEventList, projectId, entityId } = params;

    return traceEventList.map((trace) => {
      const traceRecord: TraceRecordInsertType = {
        id: entityId,
        timestamp: this.getMillisecondTimestamp(
          trace.body.timestamp ?? trace.timestamp,
        ),
        // timestamp: ("timestamp" in trace.body && trace.body.timestamp
        //   ? this.getMillisecondTimestamp(trace.body.timestamp)
        //   : undefined) as number, // Casting here is dirty, but our requirement is to have a start_time _after_ the merge
        name: trace.body.name,
        user_id: trace.body.userId,
        metadata: trace.body.metadata
          ? convertJsonSchemaToRecord(trace.body.metadata)
          : {},
        release: trace.body.release,
        version: trace.body.version,
        project_id: projectId,
        environment: trace.body.environment,
        public: trace.body.public ?? false,
        bookmarked: false,
        tags: trace.body.tags ?? [],
        // We skip the processing here as stringifying is an expensive operation on large objects.
        // Instead, we only take the last truthy value and apply it on the merge step.
        // input: this.stringify(trace.body.input),
        // output: this.stringify(trace.body.output), // convert even json to string
        session_id: trace.body.sessionId,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: new Date(trace.timestamp).getTime(),
        is_deleted: 0,
      };

      return traceRecord;
    });
  }

  private getObservationType(
    observation: ObservationEvent,
  ):
    | "EVENT"
    | "SPAN"
    | "GENERATION"
    | "AGENT"
    | "TOOL"
    | "CHAIN"
    | "RETRIEVER"
    | "EVALUATOR"
    | "GUARDRAIL"
    | "EMBEDDING" {
    switch (observation.type) {
      case eventTypes.OBSERVATION_CREATE:
      case eventTypes.OBSERVATION_UPDATE:
        return observation.body.type;
      case eventTypes.EVENT_CREATE:
        return "EVENT" as const;
      case eventTypes.SPAN_CREATE:
      case eventTypes.SPAN_UPDATE:
        return "SPAN" as const;
      case eventTypes.GENERATION_CREATE:
      case eventTypes.GENERATION_UPDATE:
        return "GENERATION" as const;
      case eventTypes.AGENT_CREATE:
        return "AGENT" as const;
      case eventTypes.TOOL_CREATE:
        return "TOOL" as const;
      case eventTypes.CHAIN_CREATE:
        return "CHAIN" as const;
      case eventTypes.RETRIEVER_CREATE:
        return "RETRIEVER" as const;
      case eventTypes.EVALUATOR_CREATE:
        return "EVALUATOR" as const;
      case eventTypes.EMBEDDING_CREATE:
        return "EMBEDDING" as const;
      case eventTypes.GUARDRAIL_CREATE:
        return "GUARDRAIL" as const;
    }
  }

  private mapObservationEventsToRecords(params: {
    projectId: string;
    entityId: string;
    observationEventList: ObservationEvent[];
    prompt: ObservationPrompt | null;
  }) {
    const { projectId, entityId, observationEventList, prompt } = params;

    return observationEventList.map((obs) => {
      const observationType = this.getObservationType(obs);

      const newInputCount =
        "usage" in obs.body ? obs.body.usage?.input : undefined;

      const newOutputCount =
        "usage" in obs.body ? obs.body.usage?.output : undefined;

      const newTotalCount =
        ("usage" in obs.body ? obs.body.usage?.total : undefined) ||
        (Object.keys(
          "usageDetails" in obs.body ? (obs.body.usageDetails ?? {}) : {},
        ).length === 0
          ? newInputCount && newOutputCount
            ? newInputCount + newOutputCount
            : (newInputCount ?? newOutputCount)
          : undefined);

      let provided_usage_details: Record<string, number> = {};

      if (newInputCount != null) provided_usage_details.input = newInputCount;
      if (newOutputCount != null)
        provided_usage_details.output = newOutputCount;
      if (newTotalCount != null) provided_usage_details.total = newTotalCount;

      provided_usage_details = {
        ...provided_usage_details,
        ...("usageDetails" in obs.body
          ? (Object.fromEntries(
              Object.entries(obs.body.usageDetails ?? {}).filter(
                ([_, val]) => val != null, // eslint-disable-line no-unused-vars
              ),
            ) as Record<string, number>)
          : {}),
      };

      let provided_cost_details: Record<string, number> = {};

      if ("usage" in obs.body) {
        const { inputCost, outputCost, totalCost } = obs.body.usage ?? {};

        if (inputCost != null) provided_cost_details.input = inputCost;
        if (outputCost != null) provided_cost_details.output = outputCost;
        if (totalCost != null) provided_cost_details.total = totalCost;
      }

      provided_cost_details = {
        ...provided_cost_details,
        ...("costDetails" in obs.body
          ? (Object.fromEntries(
              Object.entries(obs.body.costDetails ?? {}).filter(
                ([_, val]) => val != null, // eslint-disable-line no-unused-vars
              ),
            ) as Record<string, number>)
          : {}),
      };

      const observationRecord: ObservationRecordInsertType = {
        id: entityId,
        trace_id: obs.body.traceId ?? v4(),
        type: observationType,
        name: obs.body.name,
        environment:
          "environment" in obs.body ? obs.body.environment : "default",
        start_time: this.getMillisecondTimestamp(
          obs.body.startTime ?? obs.timestamp,
        ),
        // start_time: ("startTime" in obs.body && obs.body.startTime
        //   ? this.getMillisecondTimestamp(obs.body.startTime)
        //   : undefined) as number, // Casting here is dirty, but our requirement is to have a start_time _after_ the merge
        end_time:
          "endTime" in obs.body && obs.body.endTime
            ? this.getMillisecondTimestamp(obs.body.endTime)
            : undefined,
        completion_start_time:
          "completionStartTime" in obs.body && obs.body.completionStartTime
            ? this.getMillisecondTimestamp(obs.body.completionStartTime)
            : undefined,
        metadata: obs.body.metadata
          ? convertJsonSchemaToRecord(obs.body.metadata)
          : {},
        provided_model_name: "model" in obs.body ? obs.body.model : undefined,
        model_parameters:
          "modelParameters" in obs.body
            ? obs.body.modelParameters
              ? JSON.stringify(obs.body.modelParameters)
              : undefined
            : undefined,
        // We skip the processing here as stringifying is an expensive operation on large objects.
        // Instead, we only take the last truthy value and apply it on the merge step.
        // input: this.stringify(obs.body.input),
        // output: this.stringify(obs.body.output),
        provided_usage_details,
        provided_cost_details,
        usage_details: provided_usage_details,
        cost_details: provided_cost_details,
        level: obs.body.level,
        status_message: obs.body.statusMessage ?? undefined,
        parent_observation_id: obs.body.parentObservationId ?? undefined,
        version: obs.body.version ?? undefined,
        project_id: projectId,
        prompt_id: prompt?.id,
        prompt_name: prompt?.name,
        prompt_version: prompt?.version,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: new Date(obs.timestamp).getTime(),
        is_deleted: 0,
      };

      return observationRecord;
    });
  }

  private stringify(
    obj: string | object | number | boolean | undefined | null,
  ): string | undefined {
    if (obj == null) return; // return undefined on undefined or null

    return typeof obj === "string" ? obj : JSON.stringify(obj);
  }

  private getMicrosecondTimestamp(timestamp?: string | null): number {
    return timestamp ? new Date(timestamp).getTime() * 1000 : Date.now() * 1000;
  }

  private getMillisecondTimestamp(timestamp?: string | null): number {
    return timestamp ? new Date(timestamp).getTime() : Date.now();
  }

  /**
   * Flattens a nested JSON object into path-based names and values.
   * For example: {foo: {bar: "baz"}} becomes:
   * - names: ["foo.bar"]
   * - values: ["baz"]
   */
  private flattenJsonToPathArrays(
    obj: Record<string, unknown>,
    prefix: string = "",
  ): { names: string[]; values: unknown[] } {
    const names: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (
        value !== null &&
        value !== undefined &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        // Recursively flatten nested objects
        const nested = this.flattenJsonToPathArrays(
          value as Record<string, unknown>,
          path,
        );
        names.push(...nested.names);
        values.push(...nested.values);
      } else {
        // Leaf value
        names.push(path);
        values.push(value);
      }
    }

    return { names, values };
  }

  /**
   * Flattens a nested JSON object into type-specific path arrays.
   * Values are separated into string, number, bool, and other arrays based on their type.
   * Non-primitive values are JSON.stringify'd and placed in the strings group.
   */
  private flattenJsonToTypedPathArrays(obj: Record<string, unknown>): {
    stringNames: string[];
    stringValues: string[];
    numberNames: string[];
    numberValues: number[];
    boolNames: string[];
    boolValues: number[]; // ClickHouse uses 0/1 for booleans
  } {
    const stringNames: string[] = [];
    const stringValues: string[] = [];
    const numberNames: string[] = [];
    const numberValues: number[] = [];
    const boolNames: string[] = [];
    const boolValues: number[] = [];

    const { names, values } = this.flattenJsonToPathArrays(obj);

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const value = values[i];

      if (typeof value === "boolean") {
        boolNames.push(name);
        boolValues.push(value ? 1 : 0);
      } else if (typeof value === "number") {
        numberNames.push(name);
        numberValues.push(value);
      } else if (typeof value === "string") {
        stringNames.push(name);
        stringValues.push(value);
      } else {
        // For arrays, objects, null, undefined, etc., stringify and put in strings
        stringNames.push(name);
        stringValues.push(JSON.stringify(value));
      }
    }

    return {
      stringNames,
      stringValues,
      numberNames,
      numberValues,
      boolNames,
      boolValues,
    };
  }
}

type ObservationPrompt = Pick<Prompt, "id" | "name" | "version">;
