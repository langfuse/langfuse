import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { v4, version } from "uuid";

import { Model, Price, PrismaClient, Prompt } from "@langfuse/shared";
import {
  convertObservationReadToInsert,
  convertScoreReadToInsert,
  convertTraceReadToInsert,
  eventTypes,
  findModel,
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
  validateAndInflateScore,
  PromptService,
  IngestionEventType,
  UsageCostType,
  IngestionEntityTypes,
} from "@langfuse/shared/src/server";

import { tokenCount } from "../../features/tokenisation/usage";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { logger } from "@langfuse/shared/src/server";
import { ClickhouseWriter, TableName } from "../ClickhouseWriter";
import { convertJsonSchemaToRecord, overwriteObject } from "./utils";

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
    logger.info(
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

    const scoreRecordPromises: Promise<ScoreRecordInsertType>[] =
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
      });

    const scoreRecords = await Promise.all(scoreRecordPromises);

    const clickhouseScoreRecord = await this.getClickhouseRecord({
      projectId,
      entityId,
      table: TableName.Scores,
    });

    const finalScoreRecord: ScoreRecordInsertType =
      await this.mergeScoreRecords({
        clickhouseScoreRecord,
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

    const clickhouseTraceRecord = await this.getClickhouseRecord({
      projectId,
      entityId,
      table: TableName.Traces,
    });

    const finalTraceRecord = await this.mergeTraceRecords({
      clickhouseTraceRecord,
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

    const clickhouseObservationRecord = await this.getClickhouseRecord({
      projectId,
      entityId,
      table: TableName.Observations,
    });

    const finalObservationRecord = await this.mergeObservationRecords({
      projectId,
      observationRecords,
      clickhouseObservationRecord,
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
        event_ts: Date.now(),
        is_deleted: 0,
      };

      this.clickHouseWriter.addToQueue(TableName.Traces, wrapperTraceRecord);
      finalObservationRecord.trace_id = traceId;
    }

    this.clickHouseWriter.addToQueue(
      TableName.Observations,
      finalObservationRecord,
    );
  }

  private async mergeScoreRecords(params: {
    scoreRecords: ScoreRecordInsertType[];
    clickhouseScoreRecord?: ScoreRecordInsertType | null;
  }): Promise<ScoreRecordInsertType> {
    const { scoreRecords, clickhouseScoreRecord } = params;

    const recordsToMerge = clickhouseScoreRecord
      ? [clickhouseScoreRecord, ...scoreRecords]
      : scoreRecords;

    const mergedRecord = this.mergeRecords(
      recordsToMerge,
      immutableEntityKeys[TableName.Scores],
    );

    const parsedRecord = scoreRecordInsertSchema.parse(mergedRecord);
    parsedRecord.event_ts = Math.max(
      ...scoreRecords.map((r) => r.event_ts),
      clickhouseScoreRecord?.event_ts ?? -Infinity,
    );
    return parsedRecord;
  }

  private async mergeTraceRecords(params: {
    traceRecords: TraceRecordInsertType[];
    clickhouseTraceRecord?: TraceRecordInsertType | null;
  }): Promise<TraceRecordInsertType> {
    const { traceRecords, clickhouseTraceRecord } = params;

    const recordsToMerge = clickhouseTraceRecord
      ? [clickhouseTraceRecord, ...traceRecords]
      : traceRecords;

    const mergedRecord = this.mergeRecords(
      recordsToMerge,
      immutableEntityKeys[TableName.Traces],
    );

    const parsedRecord = traceRecordInsertSchema.parse(mergedRecord);
    parsedRecord.event_ts = Math.max(
      ...traceRecords.map((r) => r.event_ts),
      clickhouseTraceRecord?.event_ts ?? -Infinity,
    );
    return parsedRecord;
  }

  private async mergeObservationRecords(params: {
    projectId: string;
    observationRecords: ObservationRecordInsertType[];
    clickhouseObservationRecord?: ObservationRecordInsertType | null;
  }): Promise<ObservationRecordInsertType> {
    const { projectId, observationRecords, clickhouseObservationRecord } =
      params;

    const recordsToMerge = clickhouseObservationRecord
      ? [clickhouseObservationRecord, ...observationRecords]
      : observationRecords;

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

    return {
      ...parsedObservationRecord,
      ...generationUsage,
      event_ts: Math.max(
        ...observationRecords.map((r) => r.event_ts),
        clickhouseObservationRecord?.event_ts ?? -Infinity,
      ),
    };
  }

  private mergeRecords<T extends InsertRecord>(
    records: T[],
    immutableEntityKeys: string[],
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
  ): Pick<ObservationRecordInsertType, "usage_details"> {
    const providedUsageKeys = Object.entries(
      observationRecord.provided_usage_details ?? {},
    )
      .filter(([_, value]) => value != null)
      .map(([key]) => key);

    if (
      // Manual tokenisation when no user provided usage
      model &&
      providedUsageKeys.length === 0
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

      const usage_details: Record<string, number> = {};

      if (newInputCount != null) usage_details.input = newInputCount;
      if (newOutputCount != null) usage_details.output = newOutputCount;
      if (newTotalCount != null) usage_details.total = newTotalCount;

      return { usage_details };
    }

    return {
      usage_details: observationRecord.provided_usage_details,
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
        query: `SELECT * FROM ${table} WHERE project_id = '${projectId}' AND id = '${entityId}' ORDER BY event_ts DESC LIMIT 1 by id, project_id SETTINGS use_query_cache = false;`,
        format: "JSONEachRow",
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
          trace.body.timestamp ?? trace.timestamp,
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
        event_ts: new Date(trace.timestamp).getTime(),
        is_deleted: 0,
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

      const observationRecord: ObservationRecordInsertType = {
        id: entityId,
        trace_id: obs.body.traceId ?? v4(),
        type: observationType,
        name: obs.body.name,
        start_time: this.getMillisecondTimestamp(
          obs.body.startTime ?? obs.timestamp,
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
