import { writeFile } from "node:fs/promises";
import { parseJsonPrioritised } from "@langfuse/shared";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import {
  clickhouseClient,
  clickhouseStringDateSchema,
} from "@langfuse/shared/src/server";

// Constants
const LIMIT = 50;
const ITERATIONS = 100;
const DATE_CUTOFF = new Date("2024-08-09T08:20:00.000Z");
const TABLE_SAMPLE_RATE = 10;

async function main() {
  const failedList: string[] = [];
  const checkedSet = new Set<string>();

  let totalCount = 0;
  let currentIteration = 0;

  while (currentIteration < ITERATIONS) {
    console.log(`Iteration ${currentIteration + 1}/${ITERATIONS}`);

    const randomObservations = await prisma.$queryRaw<unknown[]>(
      Prisma.sql`
        SELECT
          *
        FROM
          observations TABLESAMPLE SYSTEM(${TABLE_SAMPLE_RATE})
        WHERE
          start_time > ${DATE_CUTOFF}::TIMESTAMP WITH time zone at time zone 'UTC'
        LIMIT ${LIMIT}
      `
    );

    console.log(`Verifying ${randomObservations.length} observations...`);

    try {
      const results = await Promise.allSettled(
        randomObservations.map(async (obs) => {
          const id = (obs as any).id;
          if (checkedSet.has(id)) {
            return Promise.resolve();
          }
          totalCount += 1;
          checkedSet.add(id);

          await verifyClickhouseObservation(obs).catch((e) => {
            throw new Error(
              `Failed to verify observation ${id}: ${e.message}, ${e.stack}`
            );
          });
        })
      );

      results.forEach((result, i) => {
        if (result.status === "rejected") {
          const message = `[${i}] ` + result.reason;
          failedList.push(message);

          console.error(message);
        }
      });
    } catch (e) {
      console.error(e);
    }

    currentIteration++;
  }

  console.log(`Total observations verified: ${totalCount}`);

  if (failedList.length > 0) {
    await writeFile(
      `src/scripts/output/${new Date().toISOString()}_failedObservations.txt`,
      failedList.join("\n")
    );

    console.error(
      `Failed to verify ${failedList.length} out of ${totalCount} observations`
    );
  }
}

main().then(() => {
  console.log("done");
  process.exit(0);
});

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
    `[${projectId}-observation-${observationId}] Field ${params.key} does not match between Postgres and Clickhouse: \n Postgres: ${JSON.stringify(params.pgValue)} \n Clickhouse: ${JSON.stringify(params.chValue)}`;

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
          pgValue !== (clickhouseRecord as any)["provided_output_usage_units"]
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue,
              chValue: (clickhouseRecord as any)["provided_output_usage_units"],
            })
          );
        }

        break;
      }

      case "prompt_tokens": {
        if (
          pgValue !== 0 &&
          pgValue !== (clickhouseRecord as any)["provided_input_usage_units"]
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue,
              chValue: (clickhouseRecord as any)["provided_input_usage_units"],
            })
          );
        }

        break;
      }

      case "total_tokens": {
        if (
          pgValue !== 0 &&
          pgValue !== (clickhouseRecord as any)["provided_total_usage_units"]
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue,
              chValue: (clickhouseRecord as any)["provided_total_usage_units"],
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
