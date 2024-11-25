import { Redis } from "ioredis";
import { v4 } from "uuid";
import { Prisma } from "@prisma/client";

import { Model, Price, PrismaClient, Prompt } from "@langfuse/shared";
import {
  ClickhouseClientType,
  IngestionEntityTypes,
  convertObservationReadToInsert,
  convertScoreReadToInsert,
  convertTraceReadToInsert,
  convertPostgresObservationToInsert,
  convertPostgresScoreToInsert,
  convertPostgresTraceToInsert,
  eventTypes,
  findModel,
  IngestionEventType,
  instrumentAsync,
  logger,
  ObservationEvent,
  observationRecordInsertSchema,
  ObservationRecordInsertType,
  observationRecordReadSchema,
  PromptService,
  ScoreEventType,
  scoreRecordInsertSchema,
  ScoreRecordInsertType,
  scoreRecordReadSchema,
  TraceEventType,
  traceRecordInsertSchema,
  TraceRecordInsertType,
  traceRecordReadSchema,
  validateAndInflateScore,
  UsageCostType,
  convertDateToClickhouseDateTime,
  TraceUpsertQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";

import { tokenCount } from "../../features/tokenisation/usage";
import { ClickhouseWriter, TableName } from "../ClickhouseWriter";
import { convertJsonSchemaToRecord, overwriteObject } from "./utils";
import { randomUUID } from "crypto";

type InsertRecord =
  | TraceRecordInsertType
  | ScoreRecordInsertType
  | ObservationRecordInsertType;

const immutableEntityKeys: {
  [TableName.Traces]: (keyof TraceRecordInsertType)[];
  [TableName.Scores]: (keyof ScoreRecordInsertType)[];
  [TableName.Observations]: (keyof ObservationRecordInsertType)[];
} = {
  [TableName.Traces]: ["id", "project_id", "timestamp", "created_at"],
  [TableName.Scores]: [
    "id",
    "project_id",
    "timestamp",
    "trace_id",
    "created_at",
  ],
  [TableName.Observations]: [
    "id",
    "project_id",
    "trace_id",
    "start_time",
    "created_at",
  ],
};

export class IngestionService {
  private promptService: PromptService;

  constructor(
    private redis: Redis,
    private prisma: PrismaClient,
    private clickHouseWriter: ClickhouseWriter,
    private clickhouseClient: ClickhouseClientType,
  ) {
    this.promptService = new PromptService(prisma, redis);
  }

  public async mergeAndWrite(
    eventType: IngestionEntityTypes,
    projectId: string,
    eventBodyId: string,
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
          traceEventList: events as TraceEventType[],
        });
      case "observation":
        return await this.processObservationEventList({
          projectId,
          entityId: eventBodyId,
          observationEventList: events as ObservationEvent[],
        });
      case "score": {
        return await this.processScoreEventList({
          projectId,
          entityId: eventBodyId,
          scoreEventList: events as ScoreEventType[],
        });
      }
    }
  }

  private async processScoreEventList(params: {
    projectId: string;
    entityId: string;
    scoreEventList: ScoreEventType[];
  }) {
    const { projectId, entityId, scoreEventList } = params;
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
    const [postgresScoreRecord, clickhouseScoreRecord, scoreRecords] =
      await Promise.all([
        this.getPostgresRecord({
          projectId,
          entityId,
          table: TableName.Scores,
        }),
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
              timestamp: this.getMillisecondTimestamp(scoreEvent.timestamp),
              name: validatedScore.name,
              value: validatedScore.value,
              source: validatedScore.source,
              trace_id: validatedScore.traceId,
              data_type: validatedScore.dataType,
              observation_id: validatedScore.observationId,
              comment: validatedScore.comment,
              string_value: validatedScore.stringValue,
              created_at: Date.now(),
              updated_at: Date.now(),
              event_ts: new Date(scoreEvent.timestamp).getTime(),
              is_deleted: 0,
            };
          }),
        ),
      ]);

    const finalScoreRecord: ScoreRecordInsertType =
      await this.mergeScoreRecords({
        clickhouseScoreRecord,
        postgresScoreRecord,
        scoreRecords,
      });

    this.clickHouseWriter.addToQueue(TableName.Scores, finalScoreRecord);
  }

  private async processTraceEventList(params: {
    projectId: string;
    entityId: string;
    traceEventList: TraceEventType[];
  }) {
    const { projectId, entityId, traceEventList } = params;
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
    const [postgresTraceRecord, clickhouseTraceRecord] = await Promise.all([
      this.getPostgresRecord({
        projectId,
        entityId,
        table: TableName.Traces,
      }),
      this.getClickhouseRecord({
        projectId,
        entityId,
        table: TableName.Traces,
        additionalFilters: {
          whereCondition: timestamp
            ? " AND timestamp >= {timestamp: DateTime64(3)} "
            : "",
          params: { timestamp },
        },
      }),
    ]);

    const finalTraceRecord = await this.mergeTraceRecords({
      clickhouseTraceRecord,
      postgresTraceRecord,
      traceRecords,
    });

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
    observationEventList: ObservationEvent[];
  }) {
    const { projectId, entityId, observationEventList } = params;
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

    const [postgresObservationRecord, clickhouseObservationRecord, prompt] =
      await Promise.all([
        this.getPostgresRecord({
          projectId,
          entityId,
          table: TableName.Observations,
        }),
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

    const observationRecords = this.mapObservationEventsToRecords({
      observationEventList: timeSortedEvents,
      projectId,
      entityId,
      prompt,
    });

    const finalObservationRecord = await this.mergeObservationRecords({
      projectId,
      observationRecords,
      postgresObservationRecord,
      clickhouseObservationRecord,
    });

    // Backward compat: create wrapper trace for SDK < 2.0.0 events that do not have a traceId
    if (!finalObservationRecord.trace_id) {
      const wrapperTraceRecord: TraceRecordInsertType = {
        id: finalObservationRecord.id,
        timestamp: finalObservationRecord.start_time,
        project_id: projectId,
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
  }

  private async mergeScoreRecords(params: {
    scoreRecords: ScoreRecordInsertType[];
    postgresScoreRecord?: ScoreRecordInsertType | null;
    clickhouseScoreRecord?: ScoreRecordInsertType | null;
  }): Promise<ScoreRecordInsertType> {
    const { scoreRecords, postgresScoreRecord, clickhouseScoreRecord } = params;

    // Set clickhouse first as this is the baseline for immutable fields
    const recordsToMerge = [
      clickhouseScoreRecord,
      postgresScoreRecord,
      ...scoreRecords,
    ].filter(Boolean) as ScoreRecordInsertType[];

    const mergedRecord = this.mergeRecords(
      recordsToMerge,
      immutableEntityKeys[TableName.Scores],
    );

    return scoreRecordInsertSchema.parse(mergedRecord);
  }

  private async mergeTraceRecords(params: {
    traceRecords: TraceRecordInsertType[];
    postgresTraceRecord?: TraceRecordInsertType | null;
    clickhouseTraceRecord?: TraceRecordInsertType | null;
  }): Promise<TraceRecordInsertType> {
    const { traceRecords, postgresTraceRecord, clickhouseTraceRecord } = params;

    // Set clickhouse first as this is the baseline for immutable fields
    const recordsToMerge = [
      clickhouseTraceRecord,
      postgresTraceRecord,
      ...traceRecords,
    ].filter(Boolean) as TraceRecordInsertType[];

    const mergedRecord = this.mergeRecords(
      recordsToMerge,
      immutableEntityKeys[TableName.Traces],
    );

    return traceRecordInsertSchema.parse(mergedRecord);
  }

  private async mergeObservationRecords(params: {
    projectId: string;
    observationRecords: ObservationRecordInsertType[];
    postgresObservationRecord?: ObservationRecordInsertType | null;
    clickhouseObservationRecord?: ObservationRecordInsertType | null;
  }): Promise<ObservationRecordInsertType> {
    const {
      projectId,
      observationRecords,
      postgresObservationRecord,
      clickhouseObservationRecord,
    } = params;

    // Set clickhouse first as this is the baseline for immutable fields
    const recordsToMerge = [
      clickhouseObservationRecord,
      postgresObservationRecord,
      ...observationRecords,
    ].filter(Boolean) as ObservationRecordInsertType[];

    const mergedRecord = this.mergeRecords(
      recordsToMerge,
      immutableEntityKeys[TableName.Observations],
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

    const generationUsage = await this.getGenerationUsage({
      projectId,
      observationRecord: parsedObservationRecord,
    });

    if (
      "usage_details" in generationUsage &&
      Object.keys(generationUsage.usage_details).length === 0
    ) {
      generationUsage.usage_details =
        postgresObservationRecord?.usage_details ?? {};
    }

    return {
      ...parsedObservationRecord,
      ...generationUsage,
    };
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
    const internalModel = await findModel({
      event: {
        projectId,
        model: observationRecord.provided_model_name ?? undefined,
      },
    });

    logger.debug(
      `Found internal model name ${internalModel?.modelName} (id: ${internalModel?.id}) for observation ${observationRecord.id}`,
    );

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

    logger.info(
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
        ([k, v]) => v != null && v >= 0,
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

      logger.info(
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

    return {
      usage_details: providedUsageDetails,
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
      .filter(([_, value]) => value != null)
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
        (acc, [_, cost]) => acc + cost,
        0,
      );

      finalCostDetails.total = finalTotalCost;
    }

    return {
      cost_details: finalCostDetails,
      total_cost: finalTotalCost,
    };
  }

  private async getClickhouseRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName.Traces;
    additionalFilters: {
      whereCondition: string;
      params: Record<string, unknown>;
    };
  }): Promise<TraceRecordInsertType | null>;
  private async getClickhouseRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName.Scores;
    additionalFilters: {
      whereCondition: string;
      params: Record<string, unknown>;
    };
  }): Promise<ScoreRecordInsertType | null>;
  private async getClickhouseRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName.Observations;
    additionalFilters: {
      whereCondition: string;
      params: Record<string, unknown>;
    };
  }): Promise<ObservationRecordInsertType | null>;
  private async getClickhouseRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName;
    additionalFilters: {
      whereCondition: string;
      params: Record<string, unknown>;
    };
  }) {
    const recordParser = {
      traces: traceRecordReadSchema,
      scores: scoreRecordReadSchema,
      observations: observationRecordReadSchema,
    };
    const { projectId, entityId, table, additionalFilters } = params;

    return await instrumentAsync(
      { name: `get-clickhouse-${table}` },
      async () => {
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
        });

        const result = await queryResult.json();

        if (result.length === 0) return null;

        return table === TableName.Traces
          ? convertTraceReadToInsert(recordParser[table].parse(result[0]))
          : table === TableName.Scores
            ? convertScoreReadToInsert(recordParser[table].parse(result[0]))
            : convertObservationReadToInsert(
                recordParser[table].parse(result[0]),
              );
      },
    );
  }

  private async getPostgresRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName.Traces;
  }): Promise<TraceRecordInsertType | null>;
  private async getPostgresRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName.Scores;
  }): Promise<ScoreRecordInsertType | null>;
  private async getPostgresRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName.Observations;
  }): Promise<ObservationRecordInsertType | null>;
  private async getPostgresRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName;
  }) {
    const recordParser = {
      traces: convertPostgresTraceToInsert,
      scores: convertPostgresScoreToInsert,
      observations: convertPostgresObservationToInsert,
    };
    const { projectId, entityId, table } = params;

    const query =
      table === TableName.Observations
        ? Prisma.sql`
          SELECT o.*,
                 o."modelParameters" as model_parameters,
                 p.name as prompt_name,
                 p.version as prompt_version
          FROM observations o
          LEFT JOIN prompts p ON o.prompt_id = p.id
          WHERE o.project_id = ${projectId}
          AND o.id = ${entityId}
          LIMIT 1;`
        : Prisma.sql`
          SELECT *
          FROM ${Prisma.raw(table)}
          WHERE project_id = ${projectId}
          AND id = ${entityId}
          LIMIT 1;`;

    const result =
      await this.prisma.$queryRaw<Array<Record<string, unknown>>>(query);

    return result.length === 0 ? null : recordParser[table](result[0]);
  }

  private mapTraceEventsToRecords(params: {
    traceEventList: TraceEventType[];
    projectId: string;
    entityId: string;
  }): TraceRecordInsertType[] {
    const { traceEventList, projectId, entityId } = params;

    return traceEventList.map((trace) => {
      if (!trace.body?.timestamp) {
        logger.warn(
          `Trace ${entityId} in project ${projectId} does not have a timestamp, using event time`,
        );
      }

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
        public: trace.body.public ?? false,
        bookmarked: false,
        tags: trace.body.tags ?? [],
        input: this.stringify(trace.body.input),
        output: this.stringify(trace.body.output), // convert even json to string
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
        (newInputCount !== undefined &&
        newOutputCount !== undefined &&
        newInputCount &&
        newOutputCount
          ? newInputCount + newOutputCount
          : (newInputCount ?? newOutputCount));

      const provided_usage_details: Record<string, number> = {};

      if (newInputCount != null) provided_usage_details.input = newInputCount;
      if (newOutputCount != null)
        provided_usage_details.output = newOutputCount;
      if (newTotalCount != null) provided_usage_details.total = newTotalCount;

      const provided_cost_details: Record<string, number> = {};

      if ("usage" in obs.body) {
        const { inputCost, outputCost, totalCost } = obs.body.usage ?? {};

        if (inputCost != null) provided_cost_details.input = inputCost;
        if (outputCost != null) provided_cost_details.output = outputCost;
        if (totalCost != null) provided_cost_details.total = totalCost;
      }

      if (obs.type?.endsWith("-create") && !obs.body?.startTime) {
        logger.warn(
          `Observation ${entityId} in project ${projectId} does not have a startTime, using event time`,
        );
      }

      const observationRecord: ObservationRecordInsertType = {
        id: entityId,
        trace_id: obs.body.traceId ?? v4(),
        type: observationType,
        name: obs.body.name,
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
        input: this.stringify(obs.body.input),
        output: this.stringify(obs.body.output),
        provided_usage_details,
        provided_cost_details,
        usage_details: provided_usage_details,
        cost_details: provided_cost_details,
        level: obs.body.level ?? "DEFAULT",
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
