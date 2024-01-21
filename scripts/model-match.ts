//
// create a function which takes 10k observations ordered by date descending, which do not have an internalModel set
// group the observations by date day, model, usage
// for each group, find the first observation with a model set
import "dotenv/config";

import { findModel } from "@/src/server/api/services/EventProcessor";
import { prisma } from "@/src/server/db";
import { type Observation } from "@prisma/client";

async function main() {
  return await modelMatch();
  // ... more code using 'result'
}

// Call the function
main().catch((err) => {
  console.error("An error occurred:", err);
});

export async function modelMatch() {
  console.log("Starting model match");
  const start = Date.now();
  const observations = await prisma.observation.findMany({
    orderBy: {
      startTime: "desc",
    },
    where: {
      internalModel: null,
      type: "GENERATION",
    },
    take: 10_000,
  });

  // group by date, model, unit, projectid

  interface GroupedObservations {
    [key: string]: Observation[];
  }

  const groupedObservations = observations.reduce<GroupedObservations>(
    (acc, observation) => {
      const key = `${observation.startTime.toISOString().slice(0, 10)}-${
        observation.model
      }-${observation.unit}-${observation.projectId}`;

      // Ensure the array is initialized before using it
      acc[key] = acc[key] ?? [];
      acc[key]?.push(observation);

      return acc;
    },
    {},
  );

  const updatePromises = [];

  for (const [key, observationsGroup] of Object.entries(groupedObservations)) {
    // Split the key into its components
    const [date, model, unit, projectId] = key.split("-");

    if (!projectId) {
      throw new Error("No project id");
    }

    // Note: The findModel function is assumed to be asynchronous.
    const foundModelPromise = findModel(
      projectId,
      model,
      unit,
      date,
      undefined,
    );

    // Push the promise for updating observations into the array
    updatePromises.push(
      foundModelPromise.then((foundModel) => {
        return prisma.observation.updateMany({
          where: {
            id: {
              in: observationsGroup.map((observation) => observation.id),
            },
          },
          data: {
            internalModel: foundModel?.modelName,
          },
        });
      }),
    );
  }

  // Wait for all update operations to complete
  await Promise.all(updatePromises);
  const end = Date.now();
  console.log(`Model match took ${end - start} ms`);
}
