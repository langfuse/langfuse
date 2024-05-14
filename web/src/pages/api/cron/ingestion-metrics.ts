import { env } from "@/src/env.mjs";
import { ServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY)
    return res.status(200).json({ message: "No PostHog key provided" });

  if (
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined ||
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV"
  )
    return res.status(200).json({
      message: "Only runs on Langfuse Cloud, no LANGFUSE_CLOUD_REGION provided",
    });

  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING")
    return res.status(200).json({
      message: "Does not run on staging, LANGFUSE_CLOUD_REGION is STAGING",
    });

  const posthog_event_user_id =
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "US"
      ? "langfuse-cloud-us"
      : "langfuse-cloud-eu";

  try {
    const posthog = new ServerPosthog();

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
        projectMembers: {
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
          project_owner: project.projectMembers
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
        distinctId: posthog_event_user_id,
        groups: {
          project: value.projectId,
        },
        properties: {
          traces: value._count.id,
        },
      });
    });

    // datasets
    const datasetCountPerProject = await prisma.dataset.groupBy({
      by: ["projectId"],
      where: {
        createdAt: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
      _count: {
        id: true,
      },
    });
    datasetCountPerProject.forEach((value) => {
      posthog.capture({
        event: "ingestion_metrics",
        distinctId: posthog_event_user_id,
        groups: {
          project: value.projectId,
        },
        properties: {
          datasets: value._count.id,
        },
      });
    });

    const datasetItemsPerProject = await prisma.$queryRaw<
      Array<{
        project_id: string;
        count_dataset_items: number;
      }>
    >`
      SELECT
        datasets.project_id project_id,
        count(DISTINCT item.id)::integer count_dataset_items
      FROM
        dataset_items item
        JOIN datasets ON datasets.id = item.dataset_id
      WHERE
        item.created_at < ${endTimeframe}
        ${
          startTimeframe
            ? Prisma.sql`AND item.created_at >= ${startTimeframe}`
            : Prisma.empty
        }
      GROUP BY
        1
    `;
    datasetItemsPerProject.forEach((value) => {
      posthog.capture({
        event: "ingestion_metrics",
        distinctId: posthog_event_user_id,
        groups: {
          project: value.project_id,
        },
        properties: {
          dataset_items: value.count_dataset_items,
        },
      });
    });

    const datasetRunItemsPerProject = await prisma.$queryRaw<
      Array<{
        project_id: string;
        count_dataset_run_items: number;
      }>
    >`
      SELECT
        datasets.project_id project_id,
        count(DISTINCT run_item.id)::integer count_dataset_run_items
      FROM
        dataset_run_items run_item
        JOIN dataset_runs run ON run.id = run_item.dataset_run_id
        JOIN datasets ON datasets.id = run.dataset_id
      WHERE
        run_item.created_at < ${endTimeframe}
          ${
            startTimeframe
              ? Prisma.sql`AND run_item.created_at >= ${startTimeframe}`
              : Prisma.empty
          }
      GROUP BY
        1
    `;
    datasetRunItemsPerProject.forEach((value) => {
      posthog.capture({
        event: "ingestion_metrics",
        distinctId: posthog_event_user_id,
        groups: {
          project: value.project_id,
        },
        properties: {
          dataset_run_items: value.count_dataset_run_items,
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
        distinctId: posthog_event_user_id,
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
        distinctId: posthog_event_user_id,
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
        distinctId: posthog_event_user_id,
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
        "#projects with datasets": datasetCountPerProject.length,
        "#projects with dataset items": datasetItemsPerProject.length,
        "#projects with dataset run items": datasetRunItemsPerProject.length,
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
