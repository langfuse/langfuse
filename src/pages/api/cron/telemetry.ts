import { prisma } from "@/src/server/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { PostHog } from "posthog-node";
import { v4 as uuidv4 } from "uuid";

// Safe as it is intended to be public
const POSTHOG_API_KEY = "phc_zkMwFajk8ehObUlMth0D7DtPItFnxETi3lmSvyQDrwB";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const posthog = new PostHog(POSTHOG_API_KEY, {
      host: "https://eu.posthog.com",
    });
    if (process.env.NODE_ENV === "development") posthog.debug();

    // Time frame is the last time this cron job ran until now
    const dbCronState = await prisma.cronJobs.findUnique({
      where: { name: "telemetry" },
    });
    const startTimeframe = dbCronState?.lastRun ?? undefined;
    const clientId = dbCronState?.state ?? uuidv4();
    const endTimeframe = new Date(Date.now());

    // Count projects
    const totalProjects = await prisma.project.count();

    // Count traces
    const countTraces = await prisma.trace.count({
      where: {
        timestamp: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    // Count scores
    const countScores = await prisma.score.count({
      where: {
        timestamp: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    // Count observations
    const countObservations = await prisma.observation.count({
      where: {
        startTime: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    // Count datasets
    const countDatasets = await prisma.dataset.count({
      where: {
        createdAt: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    // Count dataset items
    const countDatasetItems = await prisma.datasetItem.count({
      where: {
        createdAt: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    // Count dataset runs
    const countDatasetRuns = await prisma.datasetRuns.count({
      where: {
        createdAt: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    // Count dataset run items
    const countDatasetRunItems = await prisma.datasetRunItems.count({
      where: {
        createdAt: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    posthog.identify({
      distinctId: "docker:" + clientId,
      properties: {
        environment: process.env.NODE_ENV,
        docker: true,
      },
    });
    posthog.capture({
      distinctId: "docker:" + clientId,
      event: "telemetry",
      properties: {
        totalProjects: totalProjects,
        traces: countTraces,
        scores: countScores,
        observations: countObservations,
        datasets: countDatasets,
        datasetItems: countDatasetItems,
        datasetRuns: countDatasetRuns,
        datasetRunItems: countDatasetRunItems,
        startTimeframe: startTimeframe?.toISOString(),
        endTimeframe: endTimeframe.toISOString(),
      },
    });

    await posthog.shutdownAsync();

    await prisma.cronJobs.upsert({
      where: { name: "telemetry" },
      update: { lastRun: endTimeframe, state: clientId },
      create: { name: "telemetry", lastRun: endTimeframe, state: clientId },
    });

    return res.status(200).json({ message: "OK" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
