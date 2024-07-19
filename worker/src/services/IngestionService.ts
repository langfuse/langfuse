import { Redis } from "ioredis";
import { v4 } from "uuid";

import { Model, PrismaClient, QueueJobs } from "@langfuse/shared";
import {
  clickhouseClient,
  convertObservationReadToInsert,
  convertScoreReadToInsert,
  convertTraceReadToInsert,
  eventTypes,
  findModel,
  IngestionBatchEventType,
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
} from "@langfuse/shared/src/server";

import { tokenCount } from "../features/tokenisation/usage";
import { instrumentAsync, instrument } from "../instrumentation";
import logger from "../logger";
import { IngestionFlushQueue } from "../queues/ingestionFlushQueue";
import { convertJsonSchemaToRecord, overwriteObject } from "./ingestion-utils";

enum TableName {
  Traces = "traces",
  Scores = "scores",
  Observations = "observations",
}

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
  constructor(
    private redis: Redis,
    private prisma: PrismaClient,
    private ingestionFlushQueue: IngestionFlushQueue,
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
        projectId,
      });
      const serializedEventData = JSON.stringify({ ...event, projectId });

      await this.redis.lpush(projectEntityKey, serializedEventData);
      await this.redis.expire(projectEntityKey, this.bufferTtlSeconds);
      await this.ingestionFlushQueue.add(QueueJobs.FlushIngestionEntity, null, {
        jobId: projectEntityKey,
      });
    });

    await Promise.all(ingestedEvents);
  }

  public async flush(projectEntityKey: string): Promise<void> {
    const eventList = (await this.redis.lrange(projectEntityKey, 0, -1))
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

    const { projectId, entityId } =
      this.parseProjectEntityKey(projectEntityKey);
    const entityType = eventList[0].type;

    switch (entityType) {
      case eventTypes.TRACE_CREATE:
        return await this.processTraceEventList({
          projectId,
          entityId,
          traceEventList: eventList as TraceEventType[],
        });
      case eventTypes.OBSERVATION_CREATE:
      case eventTypes.OBSERVATION_UPDATE:
      case eventTypes.EVENT_CREATE:
      case eventTypes.SPAN_CREATE:
      case eventTypes.SPAN_UPDATE:
      case eventTypes.GENERATION_CREATE:
      case eventTypes.GENERATION_UPDATE:
        return await this.processObservationEventList({
          projectId,
          entityId,
          observationEventList: eventList as ObservationEvent[],
        });
      case eventTypes.SCORE_CREATE: {
        return await this.processScoreEventList({
          projectId,
          entityId,
          scoreEventList: eventList as ScoreEventType[],
        });
      }
      case eventTypes.SDK_LOG:
        break;

      default: {
        // This is a typescript hack to ensure that we have handled all cases
        const fallThrough: never = entityType;
        logger.error(
          `Unknown entity type ${fallThrough} for ${projectEntityKey}`
        );
      }
    }
  }

  private getProjectEntityKey(params: {
    entityId: string;
    projectId: string;
  }): string {
    return `project_${params.projectId}_entity_${params.entityId}`;
  }

  private parseProjectEntityKey(projectEntityKey: string) {
    const split = projectEntityKey.split("_");

    if (split.length !== 4) {
      throw new Error(
        `Invalid project entity key format ${projectEntityKey}, expected 4 parts`
      );
    }

    return {
      projectId: split[1],
      entityId: split[3],
    };
  }

  private async processScoreEventList(params: {
    projectId: string;
    entityId: string;
    scoreEventList: ScoreEventType[];
  }) {
    const { projectId, entityId, scoreEventList } = params;
    if (scoreEventList.length === 0) return;

    // Convert the events to records
    const scoreRecords: ScoreRecordInsertType[] = scoreEventList.map(
      (score) => ({
        id: entityId,
        project_id: projectId,
        timestamp: new Date(score.timestamp).getTime(),
        name: score.body.name,
        value: score.body.value,
        source: "API",
        trace_id: score.body.traceId,
        dataType: score.body.dataType,
        observation_id: score.body.observationId ?? null,
        created_at: Date.now(),
      })
    );

    // Merge the records
    const finalScoreRecord: ScoreRecordInsertType =
      await this.mergeScoreRecords({
        projectId,
        entityId,
        scoreRecords,
      });

    // Insert the final record into clickhouse
    await clickhouseClient.insert({
      table: TableName.Scores,
      format: "JSONEachRow",
      values: finalScoreRecord,
    });
  }

  private async processTraceEventList(params: {
    projectId: string;
    entityId: string;
    traceEventList: TraceEventType[];
  }) {
    const { projectId, entityId, traceEventList } = params;
    if (traceEventList.length === 0) return;

    const traceRecords = this.mapTraceEventsToRecords({
      projectId,
      entityId,
      traceEventList,
    });

    const finalTraceRecord = await this.mergeTraceRecords({
      projectId,
      entityId,
      traceRecords,
    });

    await clickhouseClient.insert({
      table: TableName.Traces,
      format: "JSONEachRow",
      values: finalTraceRecord,
    });
  }

  private async processObservationEventList(params: {
    projectId: string;
    entityId: string;
    observationEventList: ObservationEvent[];
  }) {
    const { projectId, entityId, observationEventList } = params;
    if (observationEventList.length === 0) return;

    const promptId = await this.getPromptId(projectId, observationEventList);

    const observationRecords = this.mapObservationEventsToRecords({
      observationEventList,
      projectId,
      entityId,
      promptId,
    });

    const finalObservationRecord = await this.mergeObservationRecords({
      projectId,
      entityId,
      observationRecords,
    });

    await clickhouseClient.insert({
      table: TableName.Observations,
      format: "JSONEachRow",
      values: finalObservationRecord,
    });
  }

  private async mergeScoreRecords(params: {
    projectId: string;
    entityId: string;
    scoreRecords: ScoreRecordInsertType[];
  }): Promise<ScoreRecordInsertType> {
    const { projectId, entityId, scoreRecords } = params;
    const immutableScoreRecordKeys = immutableEntityKeys[TableName.Scores];

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
      immutableScoreRecordKeys
    );

    return scoreRecordInsertSchema.parse(mergedRecord);
  }

  private async mergeTraceRecords(params: {
    projectId: string;
    entityId: string;
    traceRecords: TraceRecordInsertType[];
  }): Promise<TraceRecordInsertType> {
    const { projectId, entityId, traceRecords } = params;
    const immutableScoreRecordKeys = immutableEntityKeys[TableName.Traces];

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
      immutableScoreRecordKeys
    );

    return traceRecordInsertSchema.parse(mergedRecord);
  }

  private async mergeObservationRecords(params: {
    projectId: string;
    entityId: string;
    observationRecords: ObservationRecordInsertType[];
  }): Promise<ObservationRecordInsertType> {
    const { projectId, entityId, observationRecords } = params;
    const immutableScoreRecordKeys =
      immutableEntityKeys[TableName.Observations];

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
      immutableScoreRecordKeys
    );

    const parsed = observationRecordInsertSchema.parse(mergedRecord);

    const generationUsage = await this.getGenerationUsage({
      projectId,
      observationRecord: mergedRecord as any as ObservationRecordInsertType, // TODO: fix this
    });

    return { ...parsed, ...generationUsage };
  }

  // TODO: check and test whether this works as intended. This is the core of the merge logic
  private mergeRecords(
    records: {
      id: string;
      project_id: string;
      [key: string]: any;
    }[],
    immutableEntityKeys: string[]
  ) {
    if (records.length === 0) {
      throw new Error("No records to merge");
    }

    // TODO: check if this works as intended for observations that don't have a timestamp
    const timestampAscendingRecords = records
      .slice()
      .sort((a, b) =>
        "timestamp" in a && "timestamp" in b ? a.timestamp - b.timestamp : 0
      );

    let result: {
      id: string;
      project_id: string;
      [key: string]: any;
    } = { id: records[0].id, project_id: records[0].project_id };

    for (const record of timestampAscendingRecords) {
      result = overwriteObject(result, record, immutableEntityKeys);
    }

    return result;
  }

  private async getPromptId(
    projectId: string,
    observationEventList: ObservationEvent[]
  ): Promise<string | undefined> {
    const lastObservationWithPromptInfo = observationEventList
      .slice()
      .reverse()
      .find(this.hasPromptInformation);

    if (!lastObservationWithPromptInfo) return undefined;

    const dbPrompt = await this.prisma.prompt.findFirst({
      where: {
        projectId,
        name: lastObservationWithPromptInfo.body.promptName,
        version: lastObservationWithPromptInfo.body.promptVersion,
      },
      select: {
        id: true,
      },
    });

    return dbPrompt?.id;
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
        | "input_usage"
        | "output_usage"
        | "total_usage"
        | "input_cost"
        | "output_cost"
        | "total_cost"
        | "internal_model"
        | "internal_model_id"
      >
    | {}
  > {
    const { projectId, observationRecord } = params;

    const internalModel = await findModel({
      event: {
        projectId,
        model: observationRecord.model ?? undefined,
        unit: observationRecord.unit ?? undefined,
      },
    });

    if (!internalModel) return {};

    const tokenCounts = this.getTokenCounts(observationRecord, internalModel);
    const tokenCosts = IngestionService.calculateTokenCosts(
      internalModel,
      observationRecord,
      tokenCounts
    );

    return {
      ...tokenCounts,
      ...tokenCosts,
      internal_model: internalModel.modelName,
      internal_model_id: internalModel.id,
    };
  }

  private getTokenCounts(
    observationRecord: ObservationRecordInsertType,
    model: Model
  ): Pick<
    ObservationRecordInsertType,
    "input_usage" | "output_usage" | "total_usage"
  > {
    if (
      // No user provided usage. Note only two equal signs operator here to check for null and undefined
      observationRecord.provided_input_usage == null &&
      observationRecord.provided_output_usage == null &&
      observationRecord.provided_total_usage == null
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
        input_usage: newInputCount,
        output_usage: newOutputCount,
        total_usage: newTotalCount,
      };
    }

    return {
      input_usage: observationRecord.provided_input_usage,
      output_usage: observationRecord.provided_output_usage,
      total_usage: observationRecord.provided_total_usage,
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
      input_usage?: number | null;
      output_usage?: number | null;
      total_usage?: number | null;
    }
  ): {
    input_cost?: number | null;
    output_cost?: number | null;
    total_cost?: number | null;
  } {
    // If user has provided any cost point, do not calculate anything else
    if (
      userProvidedCosts.provided_input_cost ||
      userProvidedCosts.provided_output_cost ||
      userProvidedCosts.provided_total_cost
    ) {
      return {
        ...userProvidedCosts,
        total_cost:
          userProvidedCosts.provided_total_cost ??
          (userProvidedCosts.provided_input_cost ?? 0) +
            (userProvidedCosts.provided_output_cost ?? 0),
      };
    }

    const finalInputCost =
      tokenCounts.input_usage != null && model?.inputPrice
        ? model.inputPrice.toNumber() * tokenCounts.input_usage
        : undefined;

    const finalOutputCost =
      tokenCounts.output_usage != null && model?.outputPrice
        ? model.outputPrice.toNumber() * tokenCounts.output_usage
        : finalInputCost
          ? 0
          : undefined;

    const finalTotalCost =
      tokenCounts.total_usage != null && model?.totalPrice
        ? model.totalPrice.toNumber() * tokenCounts.total_usage
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
      const queryResult = await clickhouseClient.query({
        query: `SELECT * FROM ${table} FINAL where project_id = '${projectId}' and id = '${entityId}'`,
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
        timestamp: trace.body.timestamp
          ? new Date(trace.body.timestamp).getTime()
          : Date.now(),
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
        input: trace.body.input ? JSON.stringify(trace.body.input) : undefined, // convert even json to string
        output: trace.body.output
          ? JSON.stringify(trace.body.output)
          : undefined, // convert even json to string
        session_id: trace.body.sessionId,
        // updated_at: Date.now(), TODO: what about updated_at?
        created_at: Date.now(),
      };

      return traceRecord;
    });
  }

  private mapObservationEventsToRecords(params: {
    projectId: string;
    entityId: string;
    observationEventList: ObservationEvent[];
    promptId?: string;
  }) {
    const { projectId, entityId, observationEventList, promptId } = params;

    return observationEventList.map((obs) => {
      let type: "EVENT" | "SPAN" | "GENERATION";
      switch (obs.type) {
        case eventTypes.OBSERVATION_CREATE:
        case eventTypes.OBSERVATION_UPDATE:
          type = obs.body.type;
          break;
        case eventTypes.EVENT_CREATE:
          type = "EVENT" as const;
          break;
        case eventTypes.SPAN_CREATE:
        case eventTypes.SPAN_UPDATE:
          type = "SPAN" as const;
          break;
        case eventTypes.GENERATION_CREATE:
        case eventTypes.GENERATION_UPDATE:
          type = "GENERATION" as const;
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
        newInputCount !== undefined &&
        newOutputCount !== undefined &&
        newInputCount &&
        newOutputCount
          ? newInputCount + newOutputCount
          : newInputCount ?? newOutputCount;

      const newUnit = "usage" in obs.body ? obs.body.usage?.unit : undefined;

      const observationRecord: ObservationRecordInsertType = {
        id: entityId,
        trace_id: obs.body.traceId ?? v4(),
        type: type,
        name: obs.body.name,
        start_time: obs.body.startTime
          ? new Date(obs.body.startTime).getTime()
          : new Date().getTime(),
        end_time:
          "endTime" in obs.body && obs.body.endTime
            ? new Date(obs.body.endTime).getTime()
            : undefined,
        completion_start_time:
          "completionStartTime" in obs.body && obs.body.completionStartTime
            ? new Date(obs.body.completionStartTime).getTime()
            : undefined,
        metadata: obs.body.metadata
          ? convertJsonSchemaToRecord(obs.body.metadata)
          : {},
        model: "model" in obs.body ? obs.body.model : undefined,
        model_parameters:
          "modelParameters" in obs.body
            ? obs.body.modelParameters
              ? JSON.stringify(obs.body.modelParameters)
              : undefined
            : undefined,
        input: obs.body.input ? JSON.stringify(obs.body.input) : undefined, // convert even json to string
        output: obs.body.output ? JSON.stringify(obs.body.output) : undefined, // convert even json to string
        provided_input_usage: newInputCount,
        provided_output_usage: newOutputCount,
        provided_total_usage: newTotalCount,
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
        prompt_id: promptId,
        created_at: Date.now(),
      };

      return observationRecord;
    });
  }
}
