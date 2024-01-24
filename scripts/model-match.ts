// Description: This script is used to match observations with their internal model. This is needed
// to be able to calculate the cost of the observation.
// See docs: https://langfuse.com/docs/deployment/self-host#updating-the-application
// Execute: `npm run model:match`

import "dotenv/config";

import { findModel } from "@/src/server/api/services/EventProcessor";
import { prisma } from "@/src/server/db";
import lodash from "lodash";

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

  // while observations are not null, get the next 10000 observations
  let continueLoop = true;
  let index = 0;
  let totalObservations = 0;

  while (continueLoop) {
    type selectedType = {
      model: string | null;
      id: string;
      projectId: string;
      startTime: Date;
      unit: string;
    };

    const observations = await prisma.observation.findMany({
      select: {
        id: true,
        startTime: true,
        model: true,
        unit: true,
        projectId: true,
      },
      orderBy: {
        startTime: "desc",
      },
      where: {
        internalModel: null,
        type: "GENERATION",
        startTime: {
          lt: new Date("2020-01-24"),
        },
      },
      take: 100_000,
      skip: index * 100_000,
    });
    console.log("Observations: ", observations[0]?.id);

    console.log(`Found ${observations.length} observations to migrate`);

    interface GroupedObservations {
      [key: string]: selectedType[];
    }

    const groupedObservations = observations.reduce<GroupedObservations>(
      (acc, observation) => {
        const key = `${observation.startTime.toISOString().slice(0, 10)}_${
          observation.model
        }_${observation.unit}_${observation.projectId}`;

        // Ensure the array is initialized before using it
        acc[key] = acc[key] ?? [];
        acc[key]?.push(observation);

        return acc;
      },
      {},
    );

    const updatePromises: Array<Promise<unknown>> = [];
    let updatedObservations = 0;

    for (const [key, observationsGroup] of Object.entries(
      groupedObservations,
    )) {
      // Split the key into its components
      const [date, model, unit, projectId] = key.split("_");

      console.log("Execute key: ", date, model, unit, projectId);

      if (!projectId) {
        throw new Error("No project id");
      }

      // Note: The findModel function is assumed to be asynchronous.
      const foundModel = await findModel(
        projectId,
        model,
        unit,
        date,
        undefined,
      );

      console.log(
        "Found model: ",
        foundModel?.id,
        " for key: ",
        key,
        " with observations: ",
        observationsGroup.length,
      );

      if (foundModel) {
        // Push the promise for updating observations into the array

        lodash.chunk(observationsGroup, 32000).map((chunk) => {
          updatePromises.push(
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
          updatePromises.push(
            prisma.observation.updateMany({
              where: {
                id: {
                  in: chunk.map((observation) => observation.id),
                },
              },
              data: {
                internalModel: "none",
              },
            }),
          );
        });

        updatedObservations += observationsGroup.length;
      }
    }

    totalObservations += updatedObservations;
    // Wait for all update operations to complete
    await Promise.all(updatePromises);
    console.warn(
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

  await prisma.observation.updateMany({
    where: {
      internalModel: "none",
    },
    data: {
      internalModel: null,
    },
  });

  const end = Date.now();

  console.log(`Model match took ${end - start} ms`);
}
