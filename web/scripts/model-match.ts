// Description: New model definitions in Langfuse are automatically applied to new observations.
// You can optionally run this script to apply new model definitions to existing observations.
// See docs: https://langfuse.com/docs/deployment/self-host#migrate-models
// Execute: `npm run models:migrate`

import "dotenv/config";

import { findModel } from "@/src/server/api/services/EventProcessor";
import { prisma } from "@langfuse/shared/src/db";
import lodash from "lodash";
import { tokenCount } from "@/src/features/ingest/lib/usage";
import { type Prisma } from "@langfuse/shared/src/db";

async function main() {
  return await modelMatch();
}

// Call the function
main().catch((err) => {
  console.error("An error occurred:", err);
});

export async function modelMatch() {
  console.log("Starting model match");
  const start = Date.now();

  const BATCH_SIZE = 10_000;
  let continueLoop = true;
  let index = 0;
  let totalObservations = 0;

  while (continueLoop) {
    type ObservationSelect = {
      model: string | null;
      id: string;
      projectId: string;
      startTime: Date;
      unit: string | null;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      input: Prisma.JsonValue;
      output: Prisma.JsonValue;
    };

    const observations = await prisma.observation.findMany({
      select: {
        id: true,
        startTime: true,
        model: true,
        unit: true,
        projectId: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        input: true,
        output: true,
      },
      orderBy: {
        startTime: "desc",
      },
      where: {
        internalModel: null,
        type: "GENERATION",
        model: { not: null },
      },
      take: BATCH_SIZE,
      skip: index * BATCH_SIZE,
    });

    console.log(`Found ${observations.length} observations to migrate`);

    type Config = {
      startTime: Date;
      model: string;
      unit: string;
      projectId: string | null;
    };

    interface GroupedObservations {
      [key: string]: ObservationSelect[];
    }

    const groupedObservations = observations.reduce<GroupedObservations>(
      (acc, observation) => {
        const config = {
          startTime: observation.startTime.toISOString().slice(0, 10),
          model: observation.model,
          unit: observation.unit,
          projectId: observation.projectId,
        };

        const key = JSON.stringify(config);

        // Ensure the array is initialized before using it
        acc[key] = acc[key] ?? [];
        acc[key]?.push(observation);

        return acc;
      },
      {},
    );

    let updatedObservations = 0;
    const dbPromises = [];

    for (const [key, observationsGroup] of Object.entries(
      groupedObservations,
    )) {
      const { startTime, model, unit, projectId } = JSON.parse(key) as Config;

      console.log("Execute key: ", startTime, model, unit, projectId);

      if (!projectId) {
        throw new Error("No project id");
      }

      const foundModel = await findModel({
        event: { projectId, model, unit, startTime: startTime },
      });

      console.log(
        "Found model: ",
        foundModel?.id,
        " for key: ",
        key,
        " with observations: ",
        observationsGroup.length,
      );

      if (foundModel) {
        // find all the observations with all tokens 0 and tokenize them individually
        const observationsWithAllTokensZero = observationsGroup.filter(
          (observation) =>
            observation.promptTokens === 0 &&
            observation.completionTokens === 0 &&
            observation.totalTokens === 0,
        );

        for (const observation of observationsWithAllTokensZero) {
          console.log("Tokenizing observation: ", observation.id);
          const newInputCount = tokenCount({
            model: foundModel,
            text: observation.input,
          });
          const newOutputCount = tokenCount({
            model: foundModel,
            text: observation.output,
          });

          dbPromises.push(
            prisma.observation.update({
              where: {
                id: observation.id,
              },
              data: {
                promptTokens: newInputCount,
                completionTokens: newOutputCount,
                totalTokens: (newInputCount ?? 0) + (newOutputCount ?? 0),
                internalModel: foundModel.modelName,
              },
            }),
          );
        }

        // for all remaining observations, batch update them with the model id
        const observationsWithTokens = observationsGroup.filter(
          (observation) =>
            observation.promptTokens !== 0 ||
            observation.completionTokens !== 0 ||
            observation.totalTokens !== 0,
        );

        // Push the promise for updating observations into the array
        lodash.chunk(observationsWithTokens, 32000).map((chunk) => {
          dbPromises.push(
            prisma.observation.updateMany({
              where: {
                id: {
                  in: chunk.map((observation) => observation.id),
                },
              },
              data: {
                internalModel: foundModel.modelName,
              },
            }),
          );
        });

        updatedObservations += observationsGroup.length;
      } else {
        lodash.chunk(observationsGroup, 32000).map((chunk) => {
          dbPromises.push(
            prisma.observation.updateMany({
              where: {
                id: {
                  in: chunk.map((observation) => observation.id),
                },
              },
              data: {
                internalModel: "LANGFUSETMPNOMODEL",
              },
            }),
          );
        });

        updatedObservations += observationsGroup.length;
      }
    }

    totalObservations += updatedObservations;
    // Wait for all update operations to complete
    const promiseChunk = lodash.chunk(dbPromises, 10);

    for (const promises of promiseChunk) {
      console.log("Waiting for promises to complete", promises.length);
      await Promise.all(promises);
    }

    console.log(
      "Updated observations count: ",
      updatedObservations,
      " in total: ",
      totalObservations,
    );

    console.log(updatedObservations, observations.length);

    if (updatedObservations === 0) {
      index++;
    }

    if (observations.length === 0) {
      console.log("No more observations to migrate");
      continueLoop = false;
    }
  }

  let updatedCount;
  do {
    console.log(`Updating LANGFUSETMPNOMODEL ${updatedCount}`);
    const result = await prisma.$queryRaw<[{ id: string }]>`
    WITH to_update AS (
      SELECT id 
      FROM observations 
      WHERE internal_model = 'LANGFUSETMPNOMODEL'
      AND "type" = 'GENERATION'
      LIMIT 50000
    )
    UPDATE observations
    set internal_model = NULL
    WHERE id IN (SELECT id FROM to_update)
    RETURNING id;`;
    updatedCount = result.length;
  } while (updatedCount > 0);

  const end = Date.now();

  console.log(`Model match took ${end - start} ms`);
}
