import { prisma } from "@/src/server/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { PostHog } from "posthog-node";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY)
    return res.status(200).json({ message: "No PostHog key provided" });

  try {
    const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: "https://eu.posthog.com",
    });
    if (process.env.NODE_ENV === "development") posthog.debug();

    // Time frame is the last time this cron job ran until now
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
        members: {
          select: {
            user: {
              select: {
                email: true,
              },
            },
          },
          where: {
            role: "OWNER",
          },
        },
      },
      where: {
        updatedAt: {
          gte: startTimeframe?.toISOString(),
        },
      },
    });

    projects.forEach((project) => {
      posthog.groupIdentify({
        groupType: "project",
        groupKey: project.id,
        properties: {
          project_name: project.name,
          project_owner: project.members
            .map((member) => member.user.email)
            .join(","),
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

    console.log(
      "Updated ingestion_metrics in PostHog for #projects:",
      traceCountPerProject.length,
      "startTimeframe:",
      startTimeframe,
      "endTimeframe:",
      endTimeframe,
    );

    await prisma.cronJobs.upsert({
      where: { name: "ingestion_metrics" },
      update: { lastRun: endTimeframe },
      create: { name: "ingestion_metrics", lastRun: endTimeframe },
    });

    return res.status(200).json({ message: "OK" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
