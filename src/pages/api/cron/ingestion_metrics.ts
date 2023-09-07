import { prisma } from "@/src/server/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { PostHog } from "posthog-node";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY)
    return res.status(200).json({ message: "No PostHog key provided" });

  const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com",
  });
  if (process.env.NODE_ENV === "development") posthog.debug();

  // Time frame (15 min)
  const startTimeframe =
    (
      await prisma.cronJobs.findUnique({
        where: { name: "ingestion_metrics" },
      })
    )?.lastRun ?? undefined;
  const endTimeframe = new Date(Date.now());

  const projects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });

  projects.forEach((project) => {
    posthog.groupIdentify({
      groupType: "project",
      groupKey: project.id,
      properties: {
        project_name: project.name,
        created_at: project.createdAt,
        environment: process.env.NODE_ENV,
      },
    });
  });

  const traceCountPerProject = await prisma.trace.groupBy({
    by: ["projectId"],
    where: {
      timestamp: {
        gte: startTimeframe?.toISOString(),
        lt: endTimeframe.toISOString(),
      },
    },
    _count: {
      id: true,
    },
  });

  traceCountPerProject.forEach((value) => {
    posthog.capture({
      event: "ingestion_metrics",
      distinctId: "static_id_for_project_events",
      groups: {
        project: value.projectId,
      },
      properties: {
        traces: value._count.id,
      },
    });
  });

  await posthog.shutdownAsync();

  await prisma.cronJobs.upsert({
    where: { name: "ingestion_metrics" },
    update: { lastRun: endTimeframe },
    create: { name: "ingestion_metrics", lastRun: endTimeframe },
  });

  console.log(
    "Updated ingestion_metrics in PostHog for #projects:",
    traceCountPerProject.length,
    "startTimeframe:",
    startTimeframe,
    "endTimeframe:",
    endTimeframe,
  );

  return res.status(200).json({ message: "OK" });
}
