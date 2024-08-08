import { parseJsonPrioritised } from "@langfuse/shared";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import {
  clickhouseClient,
  clickhouseStringDateSchema,
} from "@langfuse/shared/src/server";

const LIMIT = 50;
const DATE_CUTOFF = new Date("2024-08-07T16:10:00.000Z");
const TABLE_SAMPLE_RATE = 100;

async function main() {
  // Get random IDs
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

  try {
    const results = await Promise.allSettled(
      randomObservations.map((obs) => verifyClickhouseObservation(obs))
    );

    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(`[${i}]`, result.reason);
      }
    });
  } catch (e) {
    console.error(e);
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
      case "completion_start_time":
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
        if (pgValue !== chValue) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
        }

        break;
      }

      // Dates
      case "start_time":
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
        const parsedChMetadata =
          "metadata" in chValue
            ? JSON.parse(chValue.metadata)
            : JSON.parse(chValue);

        if (pgValue !== parsedChMetadata) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
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
        const parsedPgValue = pgValue;
        const parsedChValue = parseJsonPrioritised(chValue);

        if (JSON.stringify(parsedPgValue) !== JSON.stringify(parsedChValue)) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
        }

        break;
      }

      case "modelParameters": {
        const parsedPgValue = JSON.parse(pgValue);
        const parsedChValue = JSON.parse(
          (clickhouseRecord as any)["model_parameters"]
        );

        if (JSON.stringify(parsedPgValue) !== JSON.stringify(parsedChValue)) {
          throw new Error(getErrorMessage({ key, pgValue, chValue }));
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
          Number(pgValue) !== (clickhouseRecord as any)["input_cost"]
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
          Number(pgValue) !== (clickhouseRecord as any)["output_cost"]
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
          Number(pgValue) !== (clickhouseRecord as any)["total_cost"]
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
          pgValue !== (clickhouseRecord as any)["provided_input_cost"]
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
          pgValue !== (clickhouseRecord as any)["provided_output_cost"]
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
          pgValue !== (clickhouseRecord as any)["provided_total_cost"]
        ) {
          throw new Error(
            getErrorMessage({
              key,
              pgValue,
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
