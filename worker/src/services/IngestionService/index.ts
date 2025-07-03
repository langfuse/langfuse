import { Cluster, Redis } from "ioredis";
import { v4 } from "uuid";
import { Prisma } from "@prisma/client";
import {
  LangfuseNotFoundError,
  Model,
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
  scoreRecordInsertSchema,
  ScoreRecordInsertType,
  scoreRecordReadSchema,
  TraceEventType,
  traceRecordInsertSchema,
  TraceRecordInsertType,
  traceRecordReadSchema,
  TraceUpsertQueue,
  UsageCostType,
  validateAndInflateScore,
  convertObservationToTraceMt,
  convertTraceToTraceMt,
  convertScoreToTraceMt,
} from "@langfuse/shared/src/server";

import { tokenCount } from "../../features/tokenisation/usage";
import { ClickhouseWriter, TableName } from "../ClickhouseWriter";
import {
  convertJsonSchemaToRecord,
  convertRecordValuesToString,
  overwriteObject,
} from "./utils";
import { randomUUID } from "crypto";
import { env } from "../../env";
import { findModel } from "../modelMatch";
import { SpanKind } from "@opentelemetry/api";

type InsertRecord =
  | TraceRecordInsertType
  | ScoreRecordInsertType
  | ObservationRecordInsertType;

const immutableEntityKeys: {
  [TableName.Traces]: (keyof TraceRecordInsertType)[];
  [TableName.Scores]: (keyof ScoreRecordInsertType)[];
  [TableName.Observations]: (keyof ObservationRecordInsertType)[];
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
        });
      case "observation":
        return await this.processObservationEventList({
          projectId,
          entityId: eventBodyId,
          createdAtTimestamp,
          observationEventList: events as ObservationEvent[],
        });
      case "score": {
        return await this.processScoreEventList({
          projectId,
          entityId: eventBodyId,
          createdAtTimestamp,
          scoreEventList: events as ScoreEventType[],
        });
      }
    }
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
            comment: validatedScore.comment,
            metadata: scoreEvent.body.metadata
              ? convertJsonSchemaToRecord(scoreEvent.body.metadata)
              : {},
            string_value: validatedScore.stringValue,
            created_at: Date.now(),
            updated_at: Date.now(),
            event_ts: new Date(scoreEvent.timestamp).getTime(),
            is_deleted: 0,
          };
        }),
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

    if (
      env.LANGFUSE_EXPERIMENT_INSERT_INTO_AGGREGATING_MERGE_TREES === "true" &&
      finalScoreRecord.trace_id
    ) {
      const traceMtRecord = convertScoreToTraceMt(finalScoreRecord);
      this.clickHouseWriter.addToQueue(TableName.TracesMt, traceMtRecord);
    }
  }

  private async processTraceEventList(params: {
    projectId: string;
    entityId: string;
    createdAtTimestamp: Date;
    traceEventList: TraceEventType[];
  }) {
    const { projectId, entityId, createdAtTimestamp, traceEventList } = params;
    if (traceEventList.length === 0) return;

    const timeSortedEvents =
      IngestionService.toTimeSortedEventList(traceEventList);

    const traceRecords = this.mapTraceEventsToRecords({
      projectId,
      entityId,
      traceEventList: timeSortedEvents,
    });

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

    // Search for the first non-null input and output in the trace events and set them on the merged result.
    // Fallback to the ClickHouse input/output if none are found within the events list.
    const reversedRawRecords = timeSortedEvents.slice().reverse();
    finalTraceRecord.input = this.stringify(
      reversedRawRecords.find((record) => record?.body?.input)?.body?.input ??
        clickhouseTraceRecord?.input,
    );
    finalTraceRecord.output = this.stringify(
      reversedRawRecords.find((record) => record?.body?.output)?.body?.output ??
        clickhouseTraceRecord?.output,
    );

    // If the trace has a sessionId, we upsert the corresponding session into Postgres.
    if (finalTraceRecord.session_id) {
      try {
        await this.prisma.traceSession.upsert({
          where: {
            id_projectId: {
              id: finalTraceRecord.session_id,
              projectId,
            },
          },
          create: {
            id: finalTraceRecord.session_id,
            projectId,
          },
          update: {},
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          logger.warn(
            `Failed to upsert session. Session ${finalTraceRecord.session_id} in project ${projectId} already exists`,
          );
        } else {
          throw e;
        }
      }
    }

    this.clickHouseWriter.addToQueue(TableName.Traces, finalTraceRecord);

    // Experimental: Also write to traces_mt table if experiment flag is enabled
    if (
      env.LANGFUSE_EXPERIMENT_INSERT_INTO_AGGREGATING_MERGE_TREES === "true"
    ) {
      const traceMtRecord = convertTraceToTraceMt(finalTraceRecord);
      this.clickHouseWriter.addToQueue(TableName.TracesMt, traceMtRecord);
    }

    // Add trace into trace upsert queue for eval processing
    const traceUpsertQueue = TraceUpsertQueue.getInstance();
    if (!traceUpsertQueue) {
      logger.error("TraceUpsertQueue is not initialized");
      return;
    }
    await traceUpsertQueue.add(QueueJobs.TraceUpsert, {
      payload: {
        projectId: finalTraceRecord.project_id,
        traceId: finalTraceRecord.id,
      },
      id: randomUUID(),
      timestamp: new Date(),
      name: QueueJobs.TraceUpsert as const,
    });
  }

  private async processObservationEventList(params: {
    projectId: string;
    entityId: string;
    createdAtTimestamp: Date;
    observationEventList: ObservationEvent[];
  }) {
    const { projectId, entityId, createdAtTimestamp, observationEventList } =
      params;
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

    if (
      env.LANGFUSE_EXPERIMENT_INSERT_INTO_AGGREGATING_MERGE_TREES === "true" &&
      finalObservationRecord.trace_id
    ) {
      const traceMtRecord = convertObservationToTraceMt(finalObservationRecord);
      this.clickHouseWriter.addToQueue(TableName.TracesMt, traceMtRecord);
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
    const internalModel = observationRecord.provided_model_name
      ? await findModel({
          projectId,
          model: observationRecord.provided_model_name,
        })
      : null;

    const final_usage_details = this.getUsageUnits(
      observationRecord,
      internalModel,
    );
    const modelPrices = await this.getModelPrices(internalModel?.id);

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

  private async getModelPrices(modelId?: string): Promise<Price[]> {
    return modelId
      ? ((await this.prisma.price.findMany({ where: { modelId } })) ?? [])
      : [];
  }

  private getUsageUnits(
    observationRecord: ObservationRecordInsertType,
    model: Model | null | undefined,
  ): Pick<
    ObservationRecordInsertType,
    "usage_details" | "provided_usage_details"
  > {
    const providedUsageDetails = Object.fromEntries(
      Object.entries(observationRecord.provided_usage_details).filter(
        ([k, v]) => v != null && v >= 0, // eslint-disable-line no-unused-vars
      ),
    );

    if (
      // Manual tokenisation when no user provided usage
      model &&
      Object.keys(providedUsageDetails).length === 0
    ) {
      const newInputCount = tokenCount({
        text: observationRecord.input,
        model,
      });
      const newOutputCount = tokenCount({
        text: observationRecord.output,
        model,
      });

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

  private skipClickhouseReadProjectsCache = new Map<string, boolean>();

  private async shouldSkipClickHouseRead(
    projectId: string,
    minProjectCreateDate: string | undefined = undefined,
  ): Promise<boolean> {
    if (
      env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_PROJECT_IDS &&
      env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_PROJECT_IDS.split(
        ",",
      ).includes(projectId)
    ) {
      return true;
    }

    if (
      !env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_MIN_PROJECT_CREATE_DATE &&
      !minProjectCreateDate
    ) {
      return false;
    }

    if (this.skipClickhouseReadProjectsCache.has(projectId)) {
      return this.skipClickhouseReadProjectsCache.get(projectId) ?? false;
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    if (!project) {
      throw new LangfuseNotFoundError(`Project ${projectId} not found`);
    }

    const cutoffDate = new Date(
      env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_MIN_PROJECT_CREATE_DATE ??
        minProjectCreateDate ??
        new Date(), // Fallback to today. Should never apply.
    );
    const result = project.createdAt >= cutoffDate;
    this.skipClickhouseReadProjectsCache.set(projectId, result);
    return result;
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
    if (await this.shouldSkipClickHouseRead(params.projectId)) {
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
  ): "EVENT" | "SPAN" | "GENERATION" {
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

  private getMillisecondTimestamp(timestamp?: string | null): number {
    return timestamp ? new Date(timestamp).getTime() : Date.now();
  }
}

type ObservationPrompt = Pick<Prompt, "id" | "name" | "version">;
