import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { v4 } from "uuid";

import { Model, PrismaClient, Prompt, QueueJobs } from "@langfuse/shared";
import {
  convertObservationReadToInsert,
  convertScoreReadToInsert,
  convertTraceReadToInsert,
  eventTypes,
  findModel,
  IngestionBatchEventType,
  IngestionEventType,
  ingestionEventWithProjectId,
  IngestionEventWithProjectIdType,
  ObservationEvent,
  observationRecordInsertSchema,
  ObservationRecordInsertType,
  observationRecordReadSchema,
  ScoreEventType,
  scoreRecordInsertSchema,
  ScoreRecordInsertType,
  scoreRecordReadSchema,
  TraceEventType,
  traceRecordInsertSchema,
  TraceRecordInsertType,
  traceRecordReadSchema,
  ClickhouseClientType,
} from "@langfuse/shared/src/server";

import { tokenCount } from "../../features/tokenisation/usage";
import { instrumentAsync } from "../../instrumentation";
import logger from "../../logger";
import { IngestionFlushQueue } from "../../queues/ingestionFlushQueue";
import { ClickhouseWriter, TableName } from "../ClickhouseWriter";
import { convertJsonSchemaToRecord, overwriteObject } from "./utils";

enum EntityType {
  Trace = "trace",
  Score = "score",
  Observation = "observation",
  SDK_LOG = "sdk-log",
}

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

const reservedCharsEscapeMap = [
  { reserved: ":", escape: "|%|" },
  { reserved: "_", escape: "|#|" },
];

export class IngestionService {
  constructor(
    private redis: Redis,
    private prisma: PrismaClient,
    private ingestionFlushQueue: IngestionFlushQueue,
    private clickHouseWriter: ClickhouseWriter,
    private clickhouseClient: ClickhouseClientType,
    private bufferTtlSeconds: number
  ) {}

  public async addBatch(
    events: IngestionBatchEventType,
    projectId: string
  ): Promise<void> {
    const ingestedEvents = events.map(async (event) => {
      if (!("id" in event.body && event.body.id)) {
        logger.warn(
          `Received ingestion event without id, ${JSON.stringify(event)}`
        );

        return null;
      }

      const projectEntityKey = this.getProjectEntityKey({
        entityId: event.body.id,
        eventType: this.getEventType(event),
        projectId,
      });
      const bufferKey = this.getBufferKey(projectEntityKey);
      const serializedEventData = JSON.stringify({ ...event, projectId });

      await this.redis.lpush(bufferKey, serializedEventData);
      await this.redis.expire(bufferKey, this.bufferTtlSeconds);
      await this.ingestionFlushQueue.add(QueueJobs.FlushIngestionEntity, null, {
        jobId: projectEntityKey,
      });
    });

    await Promise.all(ingestedEvents);
  }

  public async flush(projectEntityKey: string): Promise<void> {
    const bufferKey = this.getBufferKey(projectEntityKey);
    const eventList = (await this.redis.lrange(bufferKey, 0, -1))
      .map((serializedEventData) => {
        const parsed = ingestionEventWithProjectId.safeParse(
          JSON.parse(serializedEventData)
        );

        if (!parsed.success) {
          logger.error(
            `Failed to parse event ${serializedEventData} : ${parsed.error}`
          );

          return null;
        }

        return parsed.data;
      })
      .filter(Boolean) as IngestionEventWithProjectIdType[];

    if (eventList.length === 0) {
      throw new Error(
        `No valid events found in buffer for project entity ${projectEntityKey}`
      );
    }

    const { projectId, eventType, entityId } =
      this.parseProjectEntityKey(projectEntityKey);

    switch (eventType) {
      case EntityType.Trace:
        return await this.processTraceEventList({
          projectId,
          entityId,
          traceEventList: eventList as TraceEventType[],
        });
      case EntityType.Observation:
        return await this.processObservationEventList({
          projectId,
          entityId,
          observationEventList: eventList as ObservationEvent[],
        });
      case EntityType.Score: {
        return; // TODO: refactor score validations and enable processing again
        // return await this.processScoreEventList({
        //   projectId,
        //   entityId,
        //   scoreEventList: eventList as ScoreEventType[],
        // });
      }
    }
  }

  private getEventType(event: IngestionEventType): EntityType {
    switch (event.type) {
      case eventTypes.TRACE_CREATE:
        return EntityType.Trace;
      case eventTypes.OBSERVATION_CREATE:
      case eventTypes.OBSERVATION_UPDATE:
      case eventTypes.EVENT_CREATE:
      case eventTypes.SPAN_CREATE:
      case eventTypes.SPAN_UPDATE:
      case eventTypes.GENERATION_CREATE:
      case eventTypes.GENERATION_UPDATE:
        return EntityType.Observation;
      case eventTypes.SCORE_CREATE:
        return EntityType.Score;
      case eventTypes.SDK_LOG:
        return EntityType.SDK_LOG;
    }
  }

  private getProjectEntityKey(params: {
    projectId: string;
    eventType: EntityType;
    entityId: string;
  }): string {
    const sanitizedEntityId = IngestionService.escapeReservedChars(
      params.entityId
    );

    return `${params.projectId}_${params.eventType}_${sanitizedEntityId}`;
  }

  private parseProjectEntityKey(projectEntityKey: string) {
    const split = projectEntityKey.split("_");

    if (split.length !== 3) {
      throw new Error(
        `Invalid project entity key format ${projectEntityKey}, expected 3 parts`
      );
    }

    const [projectId, eventType, escapedEntityId] = split;
    const entityId = IngestionService.unescapeReservedChars(escapedEntityId);

    return { projectId, eventType, entityId };
  }

  private getBufferKey(projectEntityKey: string): string {
    return "ingestionBuffer:" + projectEntityKey;
  }

  private static escapeReservedChars(string: string): string {
    return reservedCharsEscapeMap.reduce(
      (acc, { reserved, escape }) => acc.replaceAll(reserved, escape),
      string
    );
  }

  private static unescapeReservedChars(escapedString: string): string {
    return reservedCharsEscapeMap.reduce(
      (acc, { reserved, escape }) => acc.replaceAll(escape, reserved),
      escapedString
    );
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

    const scoreRecords: ScoreRecordInsertType[] = timeSortedEvents.map(
      (score) => ({
        id: entityId,
        project_id: projectId,
        timestamp: this.getMillisecondTimestamp(score.timestamp),
        name: score.body.name,
        value: score.body.value,
        source: "API",
        trace_id: score.body.traceId,
        data_type: score.body.dataType,
        observation_id: score.body.observationId ?? null,
        created_at: Date.now(),
        updated_at: Date.now(),
      })
    );

    const finalScoreRecord: ScoreRecordInsertType =
      await this.mergeScoreRecords({
        projectId,
        entityId,
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

    const finalTraceRecord = await this.mergeTraceRecords({
      projectId,
      entityId,
      traceRecords,
    });

    this.clickHouseWriter.addToQueue(TableName.Traces, finalTraceRecord);
  }

  private async processObservationEventList(params: {
    projectId: string;
    entityId: string;
    observationEventList: ObservationEvent[];
  }) {
    const { projectId, entityId, observationEventList } = params;
    if (observationEventList.length === 0) return;

    const prompt = await this.getPrompt(projectId, observationEventList);
    const timeSortedEvents =
      IngestionService.toTimeSortedEventList(observationEventList);

    const observationRecords = this.mapObservationEventsToRecords({
      observationEventList: timeSortedEvents,
      projectId,
      entityId,
      prompt,
    });

    const finalObservationRecord = await this.mergeObservationRecords({
      projectId,
      entityId,
      observationRecords,
    });

    // Backward compat: create wrapper trace for SDK < 2.0.0 events that do not have a traceId
    if (!finalObservationRecord.trace_id) {
      const traceId = randomUUID();
      const wrapperTraceRecord: TraceRecordInsertType = {
        id: traceId,
        timestamp: finalObservationRecord.start_time,
        project_id: projectId,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {},
        tags: [],
        bookmarked: false,
        public: false,
      };

      this.clickHouseWriter.addToQueue(TableName.Traces, wrapperTraceRecord);
      finalObservationRecord.trace_id = traceId;
    }

    this.clickHouseWriter.addToQueue(
      TableName.Observations,
      finalObservationRecord
    );
  }

  private async mergeScoreRecords(params: {
    projectId: string;
    entityId: string;
    scoreRecords: ScoreRecordInsertType[];
  }): Promise<ScoreRecordInsertType> {
    const { projectId, entityId, scoreRecords } = params;

    const clickhouseScoreRecord = await this.getClickhouseRecord({
      projectId,
      entityId,
      table: TableName.Scores,
    });

    const recordsToMerge = clickhouseScoreRecord
      ? [clickhouseScoreRecord, ...scoreRecords]
      : scoreRecords;

    const mergedRecord = this.mergeRecords(
      recordsToMerge,
      immutableEntityKeys[TableName.Scores]
    );

    return scoreRecordInsertSchema.parse(mergedRecord);
  }

  private async mergeTraceRecords(params: {
    projectId: string;
    entityId: string;
    traceRecords: TraceRecordInsertType[];
  }): Promise<TraceRecordInsertType> {
    const { projectId, entityId, traceRecords } = params;

    const clickhouseTraceRecord = await this.getClickhouseRecord({
      projectId,
      entityId,
      table: TableName.Traces,
    });

    const recordsToMerge = clickhouseTraceRecord
      ? [clickhouseTraceRecord, ...traceRecords]
      : traceRecords;

    const mergedRecord = this.mergeRecords(
      recordsToMerge,
      immutableEntityKeys[TableName.Traces]
    );

    return traceRecordInsertSchema.parse(mergedRecord);
  }

  private async mergeObservationRecords(params: {
    projectId: string;
    entityId: string;
    observationRecords: ObservationRecordInsertType[];
  }): Promise<ObservationRecordInsertType> {
    const { projectId, entityId, observationRecords } = params;

    const existingObservationRecord = await this.getClickhouseRecord({
      projectId,
      entityId,
      table: TableName.Observations,
    });

    const recordsToMerge = existingObservationRecord
      ? [existingObservationRecord, ...observationRecords]
      : observationRecords;

    const mergedRecord = this.mergeRecords(
      recordsToMerge,
      immutableEntityKeys[TableName.Observations]
    );

    const parsedObservationRecord =
      observationRecordInsertSchema.parse(mergedRecord);

    const generationUsage = await this.getGenerationUsage({
      projectId,
      observationRecord: parsedObservationRecord,
    });

    return { ...parsedObservationRecord, ...generationUsage };
  }

  private mergeRecords<T extends InsertRecord>(
    records: T[],
    immutableEntityKeys: string[]
  ): unknown {
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
    observationEventList: ObservationEvent[]
  ): Promise<ObservationPrompt | null> {
    const lastObservationWithPromptInfo = observationEventList
      .slice()
      .reverse()
      .find(this.hasPromptInformation);

    if (!lastObservationWithPromptInfo) return null;

    const dbPrompt = await this.prisma.prompt.findFirst({
      where: {
        projectId,
        name: lastObservationWithPromptInfo.body.promptName,
        version: lastObservationWithPromptInfo.body.promptVersion,
      },
      select: {
        id: true,
        name: true,
        version: true,
      },
    });

    return dbPrompt;
  }

  private hasPromptInformation(
    event: ObservationEvent
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
        | "input_usage_units"
        | "output_usage_units"
        | "total_usage_units"
        | "input_cost"
        | "output_cost"
        | "total_cost"
        | "internal_model_id"
      >
    | {}
  > {
    const { projectId, observationRecord } = params;

    const internalModel = await findModel({
      event: {
        projectId,
        model: observationRecord.provided_model_name ?? undefined,
        unit: observationRecord.unit ?? undefined,
      },
    });

    const tokenCounts = this.getTokenCounts(observationRecord, internalModel);
    const tokenCosts = IngestionService.calculateTokenCosts(
      internalModel,
      observationRecord,
      tokenCounts
    );

    return {
      ...tokenCounts,
      ...tokenCosts,
      internal_model_id: internalModel?.id,
    };
  }

  private getTokenCounts(
    observationRecord: ObservationRecordInsertType,
    model: Model | null | undefined
  ): Pick<
    ObservationRecordInsertType,
    "input_usage_units" | "output_usage_units" | "total_usage_units"
  > {
    if (
      // No user provided usage. Note only two equal signs operator here to check for null and undefined
      model &&
      observationRecord.provided_input_usage_units == null &&
      observationRecord.provided_output_usage_units == null &&
      observationRecord.provided_total_usage_units == null
    ) {
      const newInputCount = tokenCount({
        text: observationRecord.input,
        model,
      });
      const newOutputCount = tokenCount({
        text: observationRecord.output,
        model,
      });

      const newTotalCount =
        newInputCount || newOutputCount
          ? (newInputCount ?? 0) + (newOutputCount ?? 0)
          : undefined;

      return {
        input_usage_units: newInputCount,
        output_usage_units: newOutputCount,
        total_usage_units: newTotalCount,
      };
    }

    return {
      input_usage_units: observationRecord.provided_input_usage_units,
      output_usage_units: observationRecord.provided_output_usage_units,
      total_usage_units: observationRecord.provided_total_usage_units,
    };
  }

  static calculateTokenCosts(
    model: Model | null | undefined,
    userProvidedCosts: {
      provided_input_cost?: number | null;
      provided_output_cost?: number | null;
      provided_total_cost?: number | null;
    },
    tokenCounts: {
      input_usage_units?: number | null;
      output_usage_units?: number | null;
      total_usage_units?: number | null;
    }
  ): {
    input_cost: number | null | undefined;
    output_cost: number | null | undefined;
    total_cost: number | null | undefined;
  } {
    // If user has provided any cost point, do not calculate anything else
    if (
      userProvidedCosts.provided_input_cost != null ||
      userProvidedCosts.provided_output_cost != null ||
      userProvidedCosts.provided_total_cost != null
    ) {
      return {
        ...userProvidedCosts,
        input_cost: userProvidedCosts.provided_input_cost,
        output_cost: userProvidedCosts.provided_output_cost,
        total_cost:
          userProvidedCosts.provided_total_cost ??
          (userProvidedCosts.provided_input_cost ?? 0) +
            (userProvidedCosts.provided_output_cost ?? 0),
      };
    }

    const finalInputCost =
      tokenCounts.input_usage_units != null && model?.inputPrice
        ? model.inputPrice.toNumber() * tokenCounts.input_usage_units
        : undefined;

    const finalOutputCost =
      tokenCounts.output_usage_units != null && model?.outputPrice
        ? model.outputPrice.toNumber() * tokenCounts.output_usage_units
        : finalInputCost
          ? 0
          : undefined;

    const finalTotalCost =
      tokenCounts.total_usage_units != null && model?.totalPrice
        ? model.totalPrice.toNumber() * tokenCounts.total_usage_units
        : finalInputCost ?? finalOutputCost
          ? (finalInputCost ?? 0) + (finalOutputCost ?? 0)
          : undefined;

    return {
      input_cost: finalInputCost,
      output_cost: finalOutputCost,
      total_cost: finalTotalCost,
    };
  }

  private async getClickhouseRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName.Traces;
  }): Promise<TraceRecordInsertType | null>;
  private async getClickhouseRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName.Scores;
  }): Promise<ScoreRecordInsertType | null>;
  private async getClickhouseRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName.Observations;
  }): Promise<ObservationRecordInsertType | null>;
  private async getClickhouseRecord(params: {
    projectId: string;
    entityId: string;
    table: TableName;
  }) {
    const recordParser = {
      traces: traceRecordReadSchema,
      scores: scoreRecordReadSchema,
      observations: observationRecordReadSchema,
    };
    const { projectId, entityId, table } = params;

    return await instrumentAsync({ name: `get-${table}` }, async () => {
      const queryResult = await this.clickhouseClient.query({
        query: `SELECT * FROM ${table} WHERE project_id = '${projectId}' AND id = '${entityId}' ORDER BY updated_at DESC LIMIT 1`,
        format: "JSONEachRow",
      });

      const result = await queryResult.json();

      if (result.length === 0) return null;

      return table === TableName.Traces
        ? convertTraceReadToInsert(recordParser[table].parse(result[0]))
        : table === TableName.Scores
          ? convertScoreReadToInsert(recordParser[table].parse(result[0]))
          : convertObservationReadToInsert(
              recordParser[table].parse(result[0])
            );
    });
  }

  private mapTraceEventsToRecords(params: {
    traceEventList: TraceEventType[];
    projectId: string;
    entityId: string;
  }): TraceRecordInsertType[] {
    const { traceEventList, projectId, entityId } = params;

    return traceEventList.map((trace) => {
      const traceRecord: TraceRecordInsertType = {
        id: entityId,
        // in the default implementation, we set timestamps server side if not provided.
        // we need to insert timestamps here and change the SDKs to send timestamps client side.
        timestamp: this.getMillisecondTimestamp(
          trace.body.timestamp ?? trace.timestamp
        ),
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
      };

      return traceRecord;
    });
  }

  private mapObservationEventsToRecords(params: {
    projectId: string;
    entityId: string;
    observationEventList: ObservationEvent[];
    prompt: ObservationPrompt | null;
  }) {
    const { projectId, entityId, observationEventList, prompt } = params;

    return observationEventList.map((obs) => {
      let observationType: "EVENT" | "SPAN" | "GENERATION";
      switch (obs.type) {
        case eventTypes.OBSERVATION_CREATE:
        case eventTypes.OBSERVATION_UPDATE:
          observationType = obs.body.type;
          break;
        case eventTypes.EVENT_CREATE:
          observationType = "EVENT" as const;
          break;
        case eventTypes.SPAN_CREATE:
        case eventTypes.SPAN_UPDATE:
          observationType = "SPAN" as const;
          break;
        case eventTypes.GENERATION_CREATE:
        case eventTypes.GENERATION_UPDATE:
          observationType = "GENERATION" as const;
          break;
      }

      // metadata needs to be converted to a record<string, string>.
      // prefix all keys with "metadata." if they are an array or primitive
      const convertedMetadata: Record<string, string> = {};

      if (typeof obs.body.metadata === "string") {
        convertedMetadata["metadata"] = obs.body.metadata;
      }

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
          : newInputCount ?? newOutputCount);

      const newUnit = "usage" in obs.body ? obs.body.usage?.unit : undefined;

      const observationRecord: ObservationRecordInsertType = {
        id: entityId,
        trace_id: obs.body.traceId ?? v4(),
        type: observationType,
        name: obs.body.name,
        start_time: this.getMillisecondTimestamp(
          obs.body.startTime ?? obs.timestamp
        ),
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
        provided_input_usage_units: newInputCount,
        provided_output_usage_units: newOutputCount,
        provided_total_usage_units: newTotalCount,
        unit: newUnit,
        level: obs.body.level ?? "DEFAULT",
        status_message: obs.body.statusMessage ?? undefined,
        parent_observation_id: obs.body.parentObservationId ?? undefined,
        version: obs.body.version ?? undefined,
        project_id: projectId,
        provided_input_cost:
          "usage" in obs.body ? obs.body.usage?.inputCost : undefined,
        provided_output_cost:
          "usage" in obs.body ? obs.body.usage?.outputCost : undefined,
        provided_total_cost:
          "usage" in obs.body ? obs.body.usage?.totalCost : undefined,
        prompt_id: prompt?.id,
        prompt_name: prompt?.name,
        prompt_version: prompt?.version,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      return observationRecord;
    });
  }

  private stringify(
    obj: string | object | number | boolean | undefined | null
  ): string | undefined {
    if (obj == null) return; // return undefined on undefined or null

    return typeof obj === "string" ? obj : JSON.stringify(obj);
  }

  private getMillisecondTimestamp(timestamp?: string | null): number {
    return timestamp ? new Date(timestamp).getTime() : Date.now();
  }
}

type ObservationPrompt = Pick<Prompt, "id" | "name" | "version">;
