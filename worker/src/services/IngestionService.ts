import { Redis } from "ioredis";
import { v4 } from "uuid";
import z from "zod";

import { PrismaClient, QueueJobs } from "@langfuse/shared";
import {
  clickhouseClient,
  convertObservationReadToInsert,
  convertScoreReadToInsert,
  convertTraceReadToInsert,
  eventTypes,
  findModel,
  IngestionBatchEventType,
  ingestionBatchEventWithProjectId,
  IngestionBatchEventWithProjectIdType,
  ObservationEvent,
  observationRecordInsert,
  observationRecordRead,
  ScoreEventType,
  scoreRecordInsert,
  scoreRecordRead,
  traceEvent,
  TraceEventType,
  traceRecordInsert,
  traceRecordRead,
} from "@langfuse/shared/src/server";

import { tokenCount } from "../features/tokenisation/usage";
import { instrumentAsync } from "../instrumentation";
import logger from "../logger";
import { IngestionFlushQueue } from "../queues/ingestionFlushQueue";
import {
  convertJsonSchemaToRecord,
  dedupeAndOverwriteObjectById,
} from "./ingestion-utils";

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
    for (const event of events) {
      if (!("id" in event.body) || !event.body.id) {
        logger.info(
          `Received ingestion event without id, ${JSON.stringify(event)}`
        );
        throw new Error("Event body must have an id"); // TODO: should we throw here?
      }

      const projectEntityKey = this.getProjectEntityKey({
        entityId: event.body.id,
        projectId,
      });
      const eventData = JSON.stringify({ ...event, projectId });

      await this.redis.lpush(projectEntityKey, eventData);
      await this.redis.expire(projectEntityKey, this.bufferTtlSeconds);
      await this.ingestionFlushQueue.add(QueueJobs.FlushIngestionEntity, null, {
        jobId: projectEntityKey,
      });
    }
  }

  private getProjectEntityKey(params: {
    entityId: string;
    projectId: string;
  }): string {
    return `project_${params.projectId}_entity_${params.entityId}`;
  }

  private parseProjectIdFromKey(projectEntityKey: string): string {
    return projectEntityKey.split("_")[1];
  }

  public async flush(projectEntityKey: string): Promise<void> {
    const entityEventList = (await this.redis.lrange(projectEntityKey, 0, -1))
      .map((serializedEvent) => {
        const parsed = ingestionBatchEventWithProjectId.safeParse(
          JSON.parse(serializedEvent)
        );

        if (!parsed.success) {
          logger.error(
            `Failed to parse event ${serializedEvent} : ${parsed.error}`
          );

          return null;
        }

        return parsed.data;
      })
      .filter(Boolean) as IngestionBatchEventWithProjectIdType[];

    if (entityEventList.length === 0) {
      throw new Error(
        `No valid events found in buffer for project entity ${projectEntityKey}`
      );
    }

    await this.processEntityList(projectEntityKey, entityEventList);
  }

  private async processEntityList(
    projectEntityKey: string,
    eventList: IngestionBatchEventWithProjectIdType[]
  ) {
    const projectId = this.parseProjectIdFromKey(projectEntityKey);

    switch (eventList[0].type) {
      case eventTypes.TRACE_CREATE:
        return await this.storeTrace(projectId, eventList as any); // todo: fix type cast
      case eventTypes.OBSERVATION_CREATE:
      case eventTypes.OBSERVATION_UPDATE:
      case eventTypes.EVENT_CREATE:
      case eventTypes.SPAN_CREATE:
      case eventTypes.SPAN_UPDATE:
      case eventTypes.GENERATION_CREATE:
      case eventTypes.GENERATION_UPDATE:
        return await this.storeObservation(projectId, eventList as any); // todo: fix type cast
      case eventTypes.SCORE_CREATE: {
        return await this.storeScore(projectId, eventList as any); // todo: fix type cast
      }
      case eventTypes.SDK_LOG:
        break;
    }
  }

  private async storeScore(
    projectId: string,
    scoreEventList: ScoreEventType[]
  ) {
    if (scoreEventList.length === 0) return;

    const scoreRecords = scoreEventList.map((score) => ({
      id: score.body.id ?? v4(),
      timestamp: new Date(score.timestamp).getTime() * 1000,
      name: score.body.name,
      value: score.body.value,
      source: "API",
      comment: score.body.comment,
      trace_id: score.body.traceId,
      // stringValue:
      //   score.body.dataType === "BOOLEAN" ? score.body.stringValue : null, // TODO: fix and also adjust migrations in CH
      dataType: score.body.dataType,
      observation_id: score.body.observationId ?? null,
      project_id: projectId,
      created_at: Date.now() * 1000,
    }));

    const finalRecord = await this.getDedupedAndUpdatedRecords(
      scoreRecords,
      projectId,
      "scores",
      scoreRecordInsert,
      scoreRecordRead
    );

    await clickhouseClient.insert({
      table: "scores",
      format: "JSONEachRow",
      values: finalRecord as any, // todo: fix type cast
    });
  }

  private async storeTrace(
    projectId: string,
    traceEventList: TraceEventType[]
  ) {
    if (traceEventList.length === 0) return;

    const traceEntityList = this.convertTraceEventsToRecords(
      traceEventList,
      projectId
    );
    const finalRecord = await this.getDedupedAndUpdatedRecords(
      traceEntityList,
      projectId,
      "traces",
      traceRecordInsert,
      traceRecordRead
    );

    await clickhouseClient.insert({
      table: "traces",
      format: "JSONEachRow",
      values: finalRecord as any, // todo: fix type cast
    });
  }

  private async storeObservation(
    projectId: string,
    observationEventList: ObservationEvent[]
  ) {
    if (observationEventList.length === 0) return;

    const promptMapping = await this.findPrompt(
      projectId,
      observationEventList
    );

    const observationEntities = this.convertObservationEventsToRecords(
      observationEventList,
      projectId,
      promptMapping
    );

    const cleanedRecord = await this.getDedupedAndUpdatedRecords(
      observationEntities,
      projectId,
      "observations",
      observationRecordInsert,
      observationRecordRead
    );

    const finalRecord = await this.modelMatchAndTokenization([
      cleanedRecord as any, // todo: fix type cast
    ]);

    await clickhouseClient.insert({
      table: "observations",
      format: "JSONEachRow",
      values: finalRecord,
    });
  }

  // TODO: optimize to single record
  private async findPrompt(
    projectId: string,
    observationEventList: ObservationEvent[]
  ): Promise<PromptMapping[]> {
    const uniquePrompts: PromptMapping[] = observationEventList
      .map((event) => {
        if (this.hasPromptInformation(event)) {
          return {
            name: event.body.promptName,
            version: event.body.promptVersion,
            projectId: projectId,
          };
        }
        return null;
      })
      .filter((prompt): prompt is PromptMapping => Boolean(prompt));

    // get all prompts
    const prompts = await this.prisma.prompt.findMany({
      where: {
        projectId,
        name: {
          in: [...new Set(uniquePrompts.map((p) => p.name))],
        },
        version: {
          in: [...new Set(uniquePrompts.map((p) => p.version))], // TODO: check if more prompts than needed are returned
        },
      },
    });

    // assign promptid to events
    return uniquePrompts.map((uniquePrompt) => {
      const foundPrompt = prompts.find((p) => {
        p.name === uniquePrompt.name &&
          p.version === uniquePrompt.version &&
          uniquePrompt.projectId === projectId;
      });

      return {
        ...uniquePrompt,
        promptId: foundPrompt?.id,
      };
    });
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

  // TODO: update to latest logic
  private async modelMatchAndTokenization(
    observations: z.infer<typeof observationRecordInsert>[]
  ) {
    const groupedGenerations = observations.reduce<{
      [key: string]: z.infer<typeof observationRecordInsert>[];
    }>((acc, observation) => {
      const config = {
        model: observation.model,
        unit: observation.unit,
        projectId: observation.project_id,
      };

      const key = JSON.stringify(config);

      acc[key] = acc[key] ?? [];
      acc[key]?.push(observation);

      return acc;
    }, {});

    const updatedObservations: z.infer<typeof observationRecordInsert>[] = [];

    for (const [key, observationsGroup] of Object.entries(groupedGenerations)) {
      const { model, unit, projectId } = JSON.parse(key) as {
        model: string;
        unit: string;
        projectId: string;
      };

      if (!projectId) {
        throw new Error("No project id");
      }

      if (!model) {
        continue;
      }

      const foundModel = await findModel({
        event: { projectId, model, unit },
      });

      if (foundModel) {
        observationsGroup.forEach((observation) => {
          let updatedObservation = {
            ...observation,
            internal_model: foundModel.id,
          };

          if (
            !observation.provided_input_usage &&
            !observation.provided_output_usage &&
            !observation.provided_total_usage
          ) {
            const newInputCount = tokenCount({
              model: foundModel,
              text: observation.input,
            });
            const newOutputCount = tokenCount({
              model: foundModel,
              text: observation.output,
            });
            const newTotalCount =
              (newInputCount ?? 0) + (newOutputCount ?? 0) || null;

            updatedObservation = {
              ...updatedObservation,
              input_usage: newInputCount ?? null,
              output_usage: newOutputCount ?? null,
              total_usage: newTotalCount ?? null,
            };
          } else {
            updatedObservation = {
              ...updatedObservation,
              input_usage: observation.provided_input_usage ?? null,
              output_usage: observation.provided_output_usage ?? null,
              total_usage: observation.provided_total_usage ?? null,
            };
          }

          if (
            !updatedObservation.provided_input_cost &&
            !updatedObservation.provided_output_cost &&
            !updatedObservation.provided_total_cost
          ) {
            const calculatedInputCost =
              (foundModel.inputPrice?.toNumber() ?? 0) *
              (updatedObservation.input_usage ?? 0);
            const calculatedOutputCost =
              (foundModel.outputPrice?.toNumber() ?? 0) *
              (updatedObservation.output_usage ?? 0);
            const calculatedTotalCost =
              calculatedInputCost + calculatedOutputCost;

            updatedObservation = {
              ...updatedObservation,
              input_cost: calculatedInputCost || null,
              output_cost: calculatedOutputCost || null,
              total_cost: calculatedTotalCost || null,
            };
          }

          updatedObservations.push(updatedObservation);
        });
      }
    }

    const allObservations = Object.values(groupedGenerations).flat();
    const nonUpdatedObservations = allObservations.filter(
      (obs) => !updatedObservations.find((u) => u.id === obs.id)
    );

    return [...updatedObservations, ...nonUpdatedObservations];
  }

  private async getDedupedAndUpdatedRecords<
    T extends { id: string; project_id: string },
  >(
    records: T[],
    projectId: string,
    recordType: "traces" | "scores" | "observations",
    recordInsert:
      | typeof traceRecordInsert
      | typeof scoreRecordInsert
      | typeof observationRecordInsert,
    recordRead:
      | typeof traceRecordRead
      | typeof scoreRecordRead
      | typeof observationRecordRead
  ) {
    const nonOverwritableProperties = {
      traces: ["id", "project_id", "timestamp", "created_at"],
      scores: [
        "id",
        "project_id",
        "timestamp",
        "type",
        "trace_id",
        "created_at",
      ],
      observations: ["id", "project_id", "trace_id", "timestamp", "created_at"],
    };

    // Get the existing record from clickhouse
    const clickhouseRecord = await instrumentAsync(
      { name: `get-${recordType}` },
      async () => {
        const queryResult = await clickhouseClient.query({
          query: `SELECT * FROM ${recordType} FINAL where project_id = '${projectId}' and id = '${records[0].id}'`,
          format: "JSONEachRow",
        });

        const result = await queryResult.json();

        const record = result.length ? recordRead.parse(result[0]) : null;

        if (!record) return null;

        return recordType === "traces"
          ? convertTraceReadToInsert(record as z.infer<typeof traceRecordRead>) // TODO: fix type cast
          : recordType === "scores"
            ? convertScoreReadToInsert(
                record as z.infer<typeof scoreRecordRead>
              )
            : convertObservationReadToInsert(
                record as z.infer<typeof observationRecordRead>
              );
      }
    );

    // if the record exists, we need to update the existing record with the new record
    const recordsToCollapse = clickhouseRecord
      ? [clickhouseRecord, ...records]
      : records;

    const orderedByTimestamp = recordsToCollapse.sort((a, b) =>
      "timestamp" in a && "timestamp" in b ? a.timestamp - b.timestamp : 0
    );

    const deduped = dedupeAndOverwriteObjectById(
      orderedByTimestamp,
      nonOverwritableProperties[recordType]
    );

    return z.array(recordInsert).parse(deduped)[0]; // todo: fix to single record
  }

  private convertTraceEventsToRecords(
    traceEventList: z.infer<typeof traceEvent>[],
    projectId: string
  ) {
    return traceEventList.map((trace) =>
      traceRecordInsert.parse({
        id: trace.body.id ?? v4(),
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
        updated_at: Date.now() * 1000,
        created_at: Date.now() * 1000,
      })
    );
  }

  private convertObservationEventsToRecords(
    observationEventList: ObservationEvent[],
    projectId: string,
    promptMapping: PromptMapping[]
  ) {
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

      return observationRecordInsert.parse({
        id: obs.body.id ?? v4(),
        trace_id: obs.body.traceId ?? v4(),
        type: type,
        name: obs.body.name,
        start_time: obs.body.startTime
          ? new Date(obs.body.startTime).getTime() * 1000
          : new Date().getTime() * 1000,
        end_time:
          "endTime" in obs.body && obs.body.endTime
            ? new Date(obs.body.endTime).getTime() * 1000
            : undefined,
        completion_start_time:
          "completionStartTime" in obs.body && obs.body.completionStartTime
            ? new Date(obs.body.completionStartTime).getTime() * 1000
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
        prompt_id: obs.body.id
          ? promptMapping.find(
              (p) =>
                this.hasPromptInformation(obs) &&
                p.name === obs.body.promptName &&
                p.version === obs.body.promptVersion &&
                p.projectId === projectId
            )?.promptId
          : undefined,
        created_at: Date.now(),
      });
    });
  }
}

type PromptMapping = {
  name: string;
  version: number;
  projectId: string;
  promptId?: string;
};
