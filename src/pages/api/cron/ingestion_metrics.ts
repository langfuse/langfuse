import { prisma } from "@/src/server/db";
import { Prisma } from "@prisma/client";
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

    // New/updated projects
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

    // traces
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

    // scores
    const scoreCountPerProject = await prisma.$queryRaw<
      Array<{
        project_id: string;
        count_scores: number;
      }>
    >`
      SELECT
        t.project_id,
        count(s.*)::integer count_scores
      FROM
        scores s
        JOIN traces t ON t.id = s.trace_id
          WHERE
            s.timestamp < ${endTimeframe}
            ${
              startTimeframe
                ? Prisma.sql`AND s.timestamp >= ${startTimeframe}`
                : Prisma.empty
            }
      GROUP BY
        1
    `;
    scoreCountPerProject.forEach((value) => {
      posthog.capture({
        event: "ingestion_metrics",
        distinctId: "static_id_for_project_events",
        groups: {
          project: value.project_id,
        },
        properties: {
          scores: value.count_scores,
        },
      });
    });

    // observations
    const observationCountPerProject = await prisma.observation.groupBy({
      by: ["projectId"],
      where: {
        startTime: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
      _count: {
        id: true,
      },
    });
    observationCountPerProject.forEach((value) => {
      posthog.capture({
        event: "ingestion_metrics",
        distinctId: "static_id_for_project_events",
        groups: {
          project: value.projectId,
        },
        properties: {
          observations: value._count.id,
        },
      });
    });

    // db size
    const dbSize = await prisma.$queryRaw<
      Array<{
        size_in_mb: number;
      }>
    >`
      SELECT (pg_database_size('postgres') / 1024^2)::integer AS size_in_mb
    `;
    if (dbSize[0])
      posthog.capture({
        event: "ingestion_metrics",
        distinctId: "static_id_for_project_events",
        properties: {
          total_db_size_in_mb: dbSize[0].size_in_mb,
        },
      });

    await posthog.shutdownAsync();

    console.log(
      "Updated ingestion_metrics in PostHog from startTimeframe:",
      startTimeframe?.toISOString(),
      "to endTimeframe:",
      endTimeframe.toISOString(),
      {
        "#projects with traces": traceCountPerProject.length,
        "#projects with observations": observationCountPerProject.length,
        "#projects with scores": scoreCountPerProject.length,
        "#projects (new/updated)": projects.length,
        "db size in MB": dbSize[0]?.size_in_mb,
      },
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
