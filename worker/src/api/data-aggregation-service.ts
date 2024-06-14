import {
  ObservationEvent,
  clickhouseClient,
  convertObservationReadToInsert,
  convertScoreReadToInsert,
  convertTraceReadToInsert,
  eventTypes,
  findModel,
  ingestionBatchEvent,
  ingestionEvent,
  observationRecordInsert,
  observationRecordRead,
  scoreEvent,
  scoreRecordInsert,
  scoreRecordRead,
  traceEvent,
  traceRecordInsert,
  traceRecordRead,
} from "@langfuse/shared/backend";
import z from "zod";
import { instrumentAsync } from "../instrumentation";
import { redis } from "../redis/redis";
import { v4 } from "uuid";
import _ from "lodash";
import { prisma } from "@langfuse/shared/src/db";
import { tokenCount } from "../features/tokenisation/usage";
import {
  convertJsonSchemaToRecord,
  dedupeAndOverwriteObjectById,
  overwriteObject,
} from "./ingestion-utils";

export const flushEvents = async () => {
  const redisEventsByProject = await getRedisEvents();
  await Promise.all(
    Object.entries(redisEventsByProject ?? {}).map(([projectId, events]) =>
      processRedisEventsForProject(projectId, events)
    )
  );
};

//

// IMPORTANT: in this process, everything is multi-project. Hence, we need to check for project_id at any time.
// projectId was added to the event during ingestion to Redis.
const getRedisEvents = async () => {
  // pop events from the sorted set with lowest scores
  const eventsReadyForClickhouse = await redis?.popSortedSetByRange(
    "events:flush",
    400,
    Date.now() + 10000
  );

  if (!eventsReadyForClickhouse || !eventsReadyForClickhouse[0]) {
    return;
  }

  const extractedKeys = eventsReadyForClickhouse[1].map((event) => event[0]);

  console.log(`Extracted keys ${JSON.stringify(extractedKeys)}`);

  if (!extractedKeys || extractedKeys.length === 0) {
    return;
  }
  const fullEvents = await Promise.all(
    extractedKeys.map((key) => redis?.lrange(key, 0, -1))
  );

  console.log(`Full events ${JSON.stringify(fullEvents)}`);

  return await parseRedisEvents(fullEvents.filter(Boolean) as string[][]);
};

const projectBatchEvent = ingestionEvent.and(
  z.object({ projectId: z.string() })
);

export const parseRedisEvents = async (events: string[][]) => {
  console.log(`Processing redis events ${JSON.stringify(events)}`);

  // we get string[][] which is for each projectid+id a list of elements
  // return a map of projectId -> event[][]

  const parsedEvents = events.map((event) => {
    return event.map((e) => {
      try {
        return projectBatchEvent.parse(JSON.parse(e));
      } catch (e) {
        console.error(`Failed to parse event ${e}`);
        return null;
      }
    });
  });

  console.log(`Parsed events ${JSON.stringify(parsedEvents)}`);
  // group them by projectId
  return parsedEvents.reduce<{
    [key: string]: z.infer<typeof projectBatchEvent>[][];
  }>(
    (acc, events) => {
      if (events && events.length > 0 && events[0]) {
        const projectId = events[0].projectId;
        if (!acc[projectId]) {
          acc[projectId] = [];
        }
        acc[projectId].push(
          events.filter(Boolean) as z.infer<typeof projectBatchEvent>[]
        );
      }

      return acc;
    },
    {} as { [key: string]: z.infer<typeof projectBatchEvent>[][] }
  );
};

export const processRedisEventsForProject = async (
  projectId: string,
  eventsById: z.infer<typeof ingestionEvent>[][]
) => {
  // we are getting lists per id per projectid here
  console.log(`Processing events ${JSON.stringify(eventsById)}`);

  const observationEvents: ObservationEvent[][] = [];
  const traceEvents: z.infer<typeof traceEvent>[][] = [];
  const scoreEvents: z.infer<typeof scoreEvent>[][] = [];

  eventsById.forEach((events) => {
    switch (events[0].type) {
      case eventTypes.TRACE_CREATE:
        traceEvents.push(events as z.infer<typeof traceEvent>[]);
        break;
      case eventTypes.OBSERVATION_CREATE:
      case eventTypes.OBSERVATION_UPDATE:
      case eventTypes.EVENT_CREATE:
      case eventTypes.SPAN_CREATE:
      case eventTypes.SPAN_UPDATE:
      case eventTypes.GENERATION_CREATE:
      case eventTypes.GENERATION_UPDATE:
        observationEvents.push(events as ObservationEvent[]);
        break;
      case eventTypes.SCORE_CREATE: {
        scoreEvents.push(events as z.infer<typeof scoreEvent>[]);
        break;
      }
      case eventTypes.SDK_LOG:
        break;
    }
  });

  // then process all of them per table in batches in parallel
  await Promise.all([
    storeObservations(projectId, observationEvents),
    storeTraces(projectId, traceEvents),
    storeScores(projectId, scoreEvents),
  ]);
};

const storeScores = async (
  projectId: string,
  scores: z.infer<typeof scoreEvent>[][]
) => {
  if (scores.length === 0) {
    return;
  }

  const insert = scores.map((scoresById) =>
    scoresById.map((score) => ({
      id: score.body.id ?? v4(),
      timestamp: new Date(score.timestamp).getTime() * 1000,
      name: score.body.name,
      value: score.body.value,
      source: "API",
      comment: score.body.comment,
      trace_id: score.body.traceId,
      observation_id: score.body.observationId ?? null,
      project_id: projectId,
    }))
  );

  const newRecords = await getDedupedAndUpdatedRecords(
    insert,
    projectId,
    "scores",
    scoreRecordInsert,
    scoreRecordRead
  );

  if (newRecords.length === 0) {
    return;
  }

  await insertFinalRecords(projectId, "scores", newRecords);
};

const storeTraces = async (
  projectId: string,
  traces: z.infer<typeof traceEvent>[][]
) => {
  console.log(`Storing traces ${JSON.stringify(traces)}`);
  if (traces.length === 0) {
    return;
  }
  const insert = convertEventToRecord(traces, projectId);

  const newRecords = await getDedupedAndUpdatedRecords(
    insert,
    projectId,
    "traces",
    traceRecordInsert,
    traceRecordRead
  );

  if (newRecords.length === 0) {
    return;
  }

  await insertFinalRecords(projectId, "traces", newRecords);
};

const storeObservations = async (
  projectId: string,
  observations: ObservationEvent[][]
) => {
  if (observations.length === 0) {
    return;
  }
  const promptMapping = await findPrompt(projectId, observations);
  // console.log("observation map ", JSON.stringify(observationMap));
  const insert = convertEventToObservation(
    observations,
    projectId,
    promptMapping
  );

  console.log(`hehe check: ${JSON.stringify(insert)}`);

  // merge observations with same id and project id into one
  const newRecords = await getDedupedAndUpdatedRecords(
    insert,
    projectId,
    "observations",
    observationRecordInsert,
    observationRecordRead
  );

  if (newRecords.length === 0) {
    return;
  }

  // model match of observations

  // const modelMatchedRecords = await modelMatchAndTokenization(newRecords);

  return await insertFinalRecords(projectId, "observations", newRecords);
};

type PromptMapping = {
  name: string;
  version: number;
  projectId: string;
  promptId?: string;
};

export const findPrompt = async (
  projectId: string,
  events: ObservationEvent[][]
): Promise<PromptMapping[]> => {
  console.log(`events to find prompts ${JSON.stringify(events)}`);

  const uniquePrompts: PromptMapping[] = events
    .flat()
    .map((event) => {
      if (hasPromptInformation(event)) {
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
  const prompts = await prisma.prompt.findMany({
    where: {
      projectId: projectId,
      name: {
        in: [...new Set(uniquePrompts.map((p) => p.name))],
      },
      version: {
        in: [...new Set(uniquePrompts.map((p) => p.version))],
      },
    },
  });

  // assign promptid to events
  return uniquePrompts.map((uP) => {
    const foundPrompt = prompts.find((p) => {
      p.name === uP.name &&
        p.version === uP.version &&
        uP.projectId === projectId;
    });
    return {
      ...uP,
      promptId: foundPrompt?.id,
    };
  });
};

function hasPromptInformation(
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
export const modelMatchAndTokenization = async (
  observations: z.infer<typeof observationRecordInsert>[]
) => {
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

    console.log(`Execute key: ${model} ${unit} ${projectId}`);

    const foundModel = await findModel({
      event: { projectId, model, unit },
    });

    console.log(
      `Found model: ${foundModel?.id} for key: ${key} with observations: ${observationsGroup.length}`
    );

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
          console.log(
            `tokenizing ${JSON.stringify(observation.input)} ${JSON.stringify(observation.output)}`
          );
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

          console.log(
            `found model ${foundModel.id} ${newInputCount} ${newOutputCount} ${newTotalCount}`
          );
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
          updatedObservation = {
            ...updatedObservation,
            input_cost:
              (foundModel.inputPrice?.toNumber() ?? 0) *
                (updatedObservation.input_usage ?? 0) || null,
            output_cost:
              (foundModel.outputPrice?.toNumber() ?? 0) *
                (updatedObservation.output_usage ?? 0) || null,
            total_cost:
              (updatedObservation.input_cost ?? 0) +
                (updatedObservation.output_cost ?? 0) || null,
          };
        }

        console.log(`Fully updated ${JSON.stringify(updatedObservation)}`);
        updatedObservations.push(updatedObservation);
      });
    }
  }

  const allObservations = Object.values(groupedGenerations).flat();
  const nonUpdatedObservations = allObservations.filter(
    (obs) => !updatedObservations.find((u) => u.id === obs.id)
  );

  console.log(
    `returning ${JSON.stringify([...updatedObservations, ...nonUpdatedObservations])}`
  );

  return [...updatedObservations, ...nonUpdatedObservations];
};

async function insertFinalRecords<T extends { id: string; project_id: string }>(
  projectId: string,
  recordType: "traces" | "scores" | "observations",
  insert: T[]
) {
  console.log(
    `Inserting final records ${recordType} ${JSON.stringify(insert)}`
  );
  const multi = redis?.multi();
  insert.forEach((record) => {
    multi?.setex(
      `${recordType}:${record.id}-${projectId}`,
      120,
      JSON.stringify(record)
    );
  });
  await multi?.exec();

  await clickhouseClient.insert({
    table: recordType,
    format: "JSONEachRow",
    values: insert,
  });
}

async function getDedupedAndUpdatedRecords<
  T extends { id: string; project_id: string },
>(
  insert: T[][],
  projectId: string,
  recordType: "traces" | "scores" | "observations",
  recordInsert: z.ZodType<any, any>,
  recordRead: z.ZodType<any, any>
) {
  const nonOverwritableProperties = {
    traces: ["id", "project_id", "name", "timestamp", "created_at"],
    scores: ["id", "project_id", "timestamp", "type", "trace_id", "created_at"],
    observations: ["id", "project_id", "trace_id", "timestamp", "created_at"],
  };

  const uniqueIds = new Set(insert.map((obs) => obs[0].id));

  const chRecords = await instrumentAsync(
    { name: `get-${recordType}` },
    async () => {
      const clickhouseRecords = await clickhouseClient.query({
        query: `SELECT * FROM ${recordType} FINAL where project_id = '${projectId}' and id in (${[...uniqueIds].map((id) => `'${id}'`).join(",")})`,
        format: "JSONEachRow",
      });
      return z
        .array(recordRead)
        .parse(await clickhouseRecords.json())
        .map((record) => {
          // convert read into write format
          if (recordType === "traces") {
            return convertTraceReadToInsert(record);
          } else if (recordType === "scores") {
            return convertScoreReadToInsert(record);
          } else {
            return convertObservationReadToInsert(record);
          }
        });
    }
  );
  console.log(`clickhouse ${recordType} ${JSON.stringify(chRecords)}`);

  const newRecords = insert
    .map((records) => {
      const existingRecord = chRecords.find(
        (r) => r !== undefined && r.id === records[0].id
      );

      // if the record exists, we need to update the existing record with the new record
      const recordsToDedupe = existingRecord
        ? [existingRecord, ...records]
        : records;

      const orderedByTimestamp = recordsToDedupe.sort((a, b) =>
        "timestamp" in a && "timestamp" in b ? a.timestamp - b.timestamp : 0
      );

      const deduped = dedupeAndOverwriteObjectById(
        orderedByTimestamp,
        nonOverwritableProperties[recordType]
      );
      console.log(`deduped ${recordType} ${JSON.stringify(deduped)} `);
      return deduped;
    })
    .flat();
  return newRecords;
}

function convertEventToRecord(
  tracesById: z.infer<typeof traceEvent>[][],
  projectId: string
) {
  return tracesById.map((traces) =>
    traces.map((trace) =>
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
    )
  );
}

function convertEventToObservation(
  observationsToStore: ObservationEvent[][],
  projectId: string,
  promptMapping: PromptMapping[]
) {
  return observationsToStore.map((observationsById) =>
    observationsById.map((obs) => {
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
                hasPromptInformation(obs) &&
                p.name === obs.body.promptName &&
                p.version === obs.body.promptVersion &&
                p.projectId === projectId
            )?.promptId
          : undefined,
        created_at: Date.now(),
      });
    })
  );
}
