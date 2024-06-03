import { env } from "@/src/env.mjs";
import { ServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";
import { prisma } from "@langfuse/shared/src/db";
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
