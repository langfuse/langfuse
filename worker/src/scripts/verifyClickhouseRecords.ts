import { writeFile } from "node:fs/promises";
import { parseJsonPrioritised } from "@langfuse/shared";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import {
  clickhouseClient,
  clickhouseStringDateSchema,
} from "@langfuse/shared/src/server";

// Constants
const LIMIT = 100;
const ITERATIONS = 10;
const DATE_START = new Date("2024-08-15T00:00:00.000Z");
const DATE_END = new Date(Date.now() - 1000 * 60 * 15); // 15 minutes ago

const TABLE_SAMPLE_RATE = 0.05;

// Execution
main({
  overwriteObservationIds: [],
  overwriteTraceIds: [],
  overwriteScoreIds: [],
}).then(() => {
  console.log("done");
  process.exit(0);
});

type MainParams = {
  overwriteObservationIds: string[];
  overwriteTraceIds: string[];
  overwriteScoreIds: string[];
};

async function main(params: MainParams) {
  const { overwriteObservationIds, overwriteTraceIds, overwriteScoreIds } =
    params;

  const hasOverwrite = [
    overwriteObservationIds,
    overwriteTraceIds,
    overwriteScoreIds,
  ].some((o) => o.length > 0);

  const failedObservationList: string[] = [];
  const failedTraceList: string[] = [];
  const failedScoreList: string[] = [];
  const checkedObservationSet = new Set<string>();
  const checkedTraceSet = new Set<string>();
  const checkedScoreSet = new Set<string>();

  let totalObservationCount = 0;
  let totalTraceCount = 0;
  let totalScoreCount = 0;
  let currentIteration = 0;

  while (currentIteration < ITERATIONS) {
    console.log(`Iteration ${currentIteration + 1}/${ITERATIONS}`);

    // Check observations
    let observations: unknown[] = [];

    if (overwriteObservationIds.length > 0) {
      observations = await prisma.$queryRaw<unknown[]>(
        Prisma.sql`
          SELECT
            *
          FROM
            observations
          WHERE
            id IN (${Prisma.join(overwriteObservationIds, ", ")})
        `
      );
    } else if (!hasOverwrite) {
      const randomObservations = await prisma.$queryRaw<unknown[]>(
        Prisma.sql`
          SELECT
            *
          FROM
            observations TABLESAMPLE SYSTEM(${TABLE_SAMPLE_RATE})
          WHERE
            start_time > ${DATE_START}::TIMESTAMP WITH time zone at time zone 'UTC'
            AND start_time < ${DATE_END}::TIMESTAMP WITH time zone at time zone 'UTC'
          LIMIT ${LIMIT}
        `
      );

      observations = randomObservations;
    }

    console.log(`Verifying ${observations.length} observations...`);

    try {
      const results = await Promise.allSettled(
        observations.map(async (obs) => {
          const id = (obs as any).id;
          if (checkedObservationSet.has(id)) {
            return;
          }
          totalObservationCount += 1;
          checkedObservationSet.add(id);

          await verifyClickhouseObservation(obs);
        })
      );

      results.forEach((result, i) => {
        if (result.status === "rejected") {
          const message = `[${i}] ` + result.reason;
          failedObservationList.push(message);

          console.error(message);
        }
      });
    } catch (e) {
      console.error(e);
    }

    // Check traces
    let traces: unknown[] = [];
    if (overwriteTraceIds.length > 0) {
      const traces = await prisma.$queryRaw<unknown[]>(
        Prisma.sql`
          SELECT *
          FROM traces
          WHERE
            id IN (${Prisma.join(overwriteTraceIds, ", ")})
        `
      );
    } else if (!hasOverwrite) {
      const randomTraces = await prisma.$queryRaw<unknown[]>(
        Prisma.sql`
        SELECT *
        FROM traces TABLESAMPLE SYSTEM(${TABLE_SAMPLE_RATE})
        WHERE
          timestamp > ${DATE_START}::TIMESTAMP WITH time zone at time zone 'UTC'
          AND timestamp < ${DATE_END}::TIMESTAMP WITH time zone at time zone 'UTC'
        LIMIT ${LIMIT}
      `
      );

      traces = randomTraces;
    }

    console.log(`Verifying ${traces.length} traces...`);

    try {
      const results = await Promise.allSettled(
        traces.map(async (trace) => {
          const id = (trace as any).id;
          if (checkedTraceSet.has(id)) {
            return;
          }
          totalTraceCount += 1;
          checkedTraceSet.add(id);

          await verifyClickhouseTrace(trace);
        })
      );

      results.forEach((result, i) => {
        if (result.status === "rejected") {
          const message = `[${i}] ` + result.reason;
          failedTraceList.push(message);

          console.error(message);
        }
      });
    } catch (e) {
      console.error(e);
    }

    // Check scores
    let scores: unknown[] = [];
    if (overwriteScoreIds.length > 0) {
      scores = await prisma.$queryRaw<unknown[]>(
        Prisma.sql`
          SELECT *
          FROM scores
          WHERE
            id IN (${Prisma.join(overwriteScoreIds, ", ")})
        `
      );
    } else if (!hasOverwrite) {
      const randomScores = await prisma.$queryRaw<unknown[]>(
        Prisma.sql`
          SELECT * 
          FROM scores TABLESAMPLE SYSTEM(${TABLE_SAMPLE_RATE})
          WHERE
            timestamp > ${DATE_START}::TIMESTAMP WITH time zone at time zone 'UTC'
            AND timestamp < ${DATE_END}::TIMESTAMP WITH time zone at time zone 'UTC'
            AND source = 'API'
          LIMIT ${LIMIT}
        `
      );

      scores = randomScores;
    }

    console.log(`Verifying ${scores.length} scores...`);

    try {
      const results = await Promise.allSettled(
        scores.map(async (score) => {
          const id = (score as any).id;
          if (checkedScoreSet.has(id)) {
            return;
          }
          totalScoreCount += 1;

          checkedScoreSet.add(id);

          await verifyClickhouseScore(score);
        })
      );

      results.forEach((result, i) => {
        if (result.status === "rejected") {
          const message = `[${i}] ` + result.reason;
          failedScoreList.push(message);

          console.error(message);
        }
      });
    } catch (e) {
      console.error(e);
    }

    currentIteration++;
    if (hasOverwrite) break;
  }

  console.log(`Total observations verified: ${totalObservationCount}`);
  console.log(`Total traces verified: ${totalTraceCount}`);
  console.log(`Total scores verified: ${totalScoreCount}`);

  if (failedObservationList.length > 0) {
    await writeFile(
      `src/scripts/output/${new Date().toISOString()}_failedObservations.txt`,
      failedObservationList.join("\n")
    ),
      console.error(
        `Failed to verify ${failedObservationList.length} out of ${totalObservationCount} observations`
      );
  } else {
    console.log(
      `All ${totalObservationCount} observations verified successfully`
    );
  }

  if (failedTraceList.length > 0) {
    await writeFile(
      `src/scripts/output/${new Date().toISOString()}_failedTraces.txt`,
      failedTraceList.join("\n")
    );

    console.error(
      `Failed to verify ${failedTraceList.length} out of ${totalTraceCount} traces`
    );
  } else {
    console.log(`All ${totalTraceCount} traces verified successfully`);
  }

  if (failedScoreList.length > 0) {
    await writeFile(
      `src/scripts/output/${new Date().toISOString()}_failedScores.txt`,
      failedScoreList.join("\n")
    );

    console.error(
      `Failed to verify ${failedScoreList.length} out of ${totalScoreCount} scores`
    );
  } else {
    console.log(`All ${totalScoreCount} scores verified successfully`);
  }
}

async function verifyClickhouseObservation(postgresObservation: any) {
  const { id: observationId, project_id: projectId } = postgresObservation;
  const clickhouseResult = await clickhouseClient.query({
    query: `SELECT * FROM observations WHERE project_id = '${projectId}' AND id = '${observationId}' ORDER BY updated_at DESC LIMIT 1`,
    format: "JSONEachRow",
  });

  const clickhouseRecord = (await clickhouseResult.json())[0];
  if (!clickhouseRecord) {
    throw new Error(
      `Observation ${observationId} not found in Clickhouse for project ${projectId}`
    );
  }

  const getErrorMessage = (params: {
    key: string;
    pgValue: any;
    chValue: any;
  }) =>
    `[${projectId}-observation-${observationId}] Mismatch between Postgres and Clickhouse:\n${JSON.stringify({ key: params.key, pg: params.pgValue, ch: params.chValue }, null, 2)}`;

  for (const key in postgresObservation) {
    const pgValue = postgresObservation[key];
    const chValue = (clickhouseRecord as any)[key];

    switch (key) {
      // Different by nature
      case "created_at":
      case "updated_at":
        continue;

      // Dropped in CH
      case "internal_model":
        continue;

      // Same in PG as in CH
      case "id":
      case "name":
      case "parent_observation_id":
      case "type":
      case "trace_id":
      case "project_id":
      case "prompt_id":
      case "level":
      case "status_message":
      case "version":
      case "internal_model_id":
      case "unit": {
        if (pgValue && pgValue !== chValue) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
        }

        break;
      }

      // Start_time cannot be overwritten in CH, so they are allowed to be different
      case "start_time": {
        if (
          pgValue &&
          chValue &&
          typeof pgValue.toISOString() !==
            typeof clickhouseStringDateSchema.parse(chValue)
        ) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
        }

        break;
      }

      // Dates
      case "completion_start_time":
      case "end_time": {
        if (
          pgValue &&
          chValue &&
          pgValue.toISOString() !== clickhouseStringDateSchema.parse(chValue)
        ) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
        }

        break;
      }

      case "metadata": {
        if (!pgValue && JSON.stringify(chValue) === "{}") continue;

        const parsedChMetadata =
          "metadata" in chValue && Object.keys(chValue).length === 1
            ? parseJsonPrioritised(chValue.metadata)
            : Object.fromEntries(
                Object.entries(chValue).map(([k, v]) => [
                  k,
                  JSON.parse(v as any),
                ])
              );

        if (
          JSON.stringify(pgValue, Object.keys(pgValue).sort()) !==
          JSON.stringify(
            parsedChMetadata,
            typeof parsedChMetadata === "string"
              ? undefined
              : Object.keys(parsedChMetadata as any).sort()
          )
        ) {
          throw new Error(
            getErrorMessage({ key, pgValue, chValue: parsedChMetadata })
          );
        }

        break;
      }

      case "model":
        if (pgValue !== (clickhouseRecord as any)["provided_model_name"]) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
        }

        break;

      case "input":
      case "output": {
        const parsedPgValue = parseJsonPrioritised(pgValue);
        const parsedChValue = parseJsonPrioritised(chValue);

        if (
          parsedPgValue &&
          JSON.stringify(parsedPgValue, Object.keys(parsedPgValue).sort()) !==
            JSON.stringify(
              parsedChValue,
              Object.keys(parsedChValue as any).sort()
            )
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue: JSON.stringify(parsedPgValue),
              chValue: JSON.stringify(parsedChValue),
            })
          );
        }

        break;
      }

      case "modelParameters": {
        const parsedPgValue = pgValue;
        const parsedChValue = JSON.parse(
          (clickhouseRecord as any)["model_parameters"]
        );

        if (
          parsedPgValue &&
          JSON.stringify(parsedPgValue, Object.keys(parsedPgValue).sort()) !==
            JSON.stringify(parsedChValue, Object.keys(parsedChValue).sort())
        ) {
          throw new Error(
            getErrorMessage({ key, pgValue, chValue: parsedChValue })
          );
        }

        break;
      }

      case "completion_tokens": {
        if (
          pgValue !== 0 &&
          pgValue !== (clickhouseRecord as any)["output_usage_units"]
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue,
              chValue: (clickhouseRecord as any)["output_usage_units"],
            })
          );
        }

        break;
      }

      case "prompt_tokens": {
        if (
          pgValue !== 0 &&
          pgValue !== (clickhouseRecord as any)["input_usage_units"]
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue,
              chValue: (clickhouseRecord as any)["input_usage_units"],
            })
          );
        }

        break;
      }

      case "total_tokens": {
        if (
          pgValue !== 0 &&
          pgValue !== (clickhouseRecord as any)["total_usage_units"]
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue,
              chValue: (clickhouseRecord as any)["total_usage_units"],
            })
          );
        }

        break;
      }

      case "calculated_input_cost": {
        if (
          pgValue !== null &&
          Math.abs(Number(pgValue) - (clickhouseRecord as any)["input_cost"]) >
            1e-9
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue,
              chValue: (clickhouseRecord as any)["input_cost"],
            })
          );
        }

        break;
      }

      case "calculated_output_cost": {
        if (
          pgValue !== null &&
          Math.abs(Number(pgValue) - (clickhouseRecord as any)["output_cost"]) >
            1e-9
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue,
              chValue: (clickhouseRecord as any)["output_cost"],
            })
          );
        }

        break;
      }

      case "calculated_total_cost": {
        if (
          pgValue !== null &&
          Math.abs(Number(pgValue) - (clickhouseRecord as any)["total_cost"]) >
            1e-9
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue,
              chValue: (clickhouseRecord as any)["total_cost"],
            })
          );
        }

        break;
      }

      case "input_cost": {
        if (
          pgValue !== null &&
          Math.abs(
            Number(pgValue) - (clickhouseRecord as any)["provided_input_cost"]
          ) > 1e-9
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue,
              chValue: (clickhouseRecord as any)["provided_input_cost"],
            })
          );
        }

        break;
      }

      case "output_cost": {
        if (
          pgValue !== null &&
          Math.abs(
            Number(pgValue) - (clickhouseRecord as any)["provided_output_cost"]
          ) > 1e-9
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue,
              chValue: (clickhouseRecord as any)["provided_output_cost"],
            })
          );
        }

        break;
      }

      case "total_cost": {
        if (
          pgValue !== null &&
          Math.abs(
            Number(pgValue) - (clickhouseRecord as any)["provided_total_cost"]
          ) > 1e-9
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue: Number(pgValue),
              chValue: (clickhouseRecord as any)["provided_total_cost"],
            })
          );
        }

        break;
      }

      default:
        throw Error("Unhandled observation key: " + key);
    }
  }
}

async function verifyClickhouseTrace(postgresTrace: any) {
  const { id: traceId, project_id: projectId } = postgresTrace;

  const clickhouseResult = await clickhouseClient.query({
    query: `SELECT * FROM traces WHERE project_id = '${projectId}' AND id = '${traceId}' ORDER BY updated_at DESC LIMIT 1`,
    format: "JSONEachRow",
  });

  const clickhouseTrace = (await clickhouseResult.json())[0];
  if (!clickhouseTrace) {
    throw new Error(
      `Trace ${traceId} not found in Clickhouse for project ${projectId}`
    );
  }

  const getErrorMessage = (params: {
    key: string;
    pgValue: any;
    chValue: any;
  }) =>
    `[${projectId}-trace-${traceId}] Mismatch between Postgres and Clickhouse:\n${JSON.stringify({ key: params.key, pg: params.pgValue, ch: params.chValue }, null, 2)}`;

  for (const key of Object.keys(postgresTrace)) {
    const pgValue = postgresTrace[key];
    const chValue = (clickhouseTrace as any)[key];

    switch (key) {
      // Different by nature
      case "created_at":
      case "updated_at":
        continue;

      // Dropped in CH
      case "external_id":
        continue;

      // Same in PG as in CH
      case "id":
      case "name":
      case "project_id":
      case "user_id":
      case "release":
      case "public":
      case "bookmarked":
      case "session_id":
      case "version": {
        if (pgValue && pgValue !== chValue) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
        }

        break;
      }

      // timestamp cannot be overwritten in CH, so they are allowed to be different
      case "timestamp": {
        if (
          pgValue &&
          chValue &&
          typeof pgValue.toISOString() !==
            typeof clickhouseStringDateSchema.parse(chValue)
        ) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
        }

        break;
      }

      case "metadata": {
        if (!pgValue && JSON.stringify(chValue) === "{}") continue;

        const parsedChMetadata =
          "metadata" in chValue && Object.keys(chValue).length === 1
            ? parseJsonPrioritised(chValue.metadata)
            : Object.fromEntries(
                Object.entries(chValue).map(([k, v]) => [
                  k,
                  JSON.parse(v as any),
                ])
              );

        if (
          JSON.stringify(pgValue, Object.keys(pgValue).sort()) !==
          JSON.stringify(
            parsedChMetadata,
            typeof parsedChMetadata === "string"
              ? undefined
              : Object.keys(parsedChMetadata as any).sort()
          )
        ) {
          throw new Error(
            getErrorMessage({ key, pgValue, chValue: parsedChMetadata })
          );
        }

        break;
      }

      case "tags":
        if (JSON.stringify(pgValue) !== JSON.stringify(chValue)) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
        }

        break;

      case "input":
      case "output": {
        const parsedPgValue = parseJsonPrioritised(pgValue);
        const parsedChValue = parseJsonPrioritised(chValue);

        if (
          parsedPgValue &&
          JSON.stringify(parsedPgValue, Object.keys(parsedPgValue).sort()) !==
            JSON.stringify(
              parsedChValue,
              parsedChValue instanceof Object
                ? Object.keys(parsedChValue as any).sort()
                : undefined
            )
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue: JSON.stringify(parsedPgValue),
              chValue: JSON.stringify(parsedChValue),
            })
          );
        }

        break;
      }

      default:
        throw Error("Unhandled observation key: " + key);
    }
  }
}

async function verifyClickhouseScore(postgresScore: any) {
  const { id: scoreId, project_id: projectId } = postgresScore;

  const clickhouseResult = await clickhouseClient.query({
    query: `SELECT * FROM scores WHERE project_id = '${projectId}' AND id = '${scoreId}' ORDER BY updated_at DESC LIMIT 1`,
    format: "JSONEachRow",
  });

  const clickhouseScore = (await clickhouseResult.json())[0];
  if (!clickhouseScore) {
    throw new Error(
      `Score ${scoreId} not found in Clickhouse for project ${projectId}`
    );
  }

  const getErrorMessage = (params: {
    key: string;
    pgValue: any;
    chValue: any;
  }) =>
    `[${projectId}-score-${scoreId}] Mismatch between Postgres and Clickhouse:\n${JSON.stringify({ key: params.key, pg: params.pgValue, ch: params.chValue }, null, 2)}`;

  for (const key of Object.keys(postgresScore)) {
    const pgValue = postgresScore[key];
    const chValue = (clickhouseScore as any)[key];

    switch (key) {
      // Different by nature
      case "created_at":
      case "updated_at":
        continue;

      // Same in PG as in CH
      case "id":
      case "name":
      case "project_id":
      case "value":
      case "observation_id":
      case "trace_id":
      case "comment":
      case "source":
      case "author_user_id":
      case "config_id":
      case "string_value":
      case "data_type": {
        if (pgValue && pgValue !== chValue) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
        }

        break;
      }

      // timestamp cannot be overwritten in CH, so they are allowed to be different
      case "timestamp": {
        if (
          pgValue &&
          chValue &&
          typeof pgValue.toISOString() !==
            typeof clickhouseStringDateSchema.parse(chValue)
        ) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
        }

        break;
      }

      default:
        throw Error("Unhandled observation key: " + key);
    }
  }
}
