import { type NextApiRequest, type NextApiResponse } from "next";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { stripeClient } from "@/src/ee/features/billing/utils/stripe";

/* 
This API route is used by Langfuse Cloud to delete API keys for a project. It will return 403 for self-hosters.
We will work on admin APIs in the future. See the discussion here: https://github.com/orgs/langfuse/discussions/3243
*/

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const stripe = stripeClient;
  if (!stripe) return;

  const meters = (await stripe.billing.meters.list()).data.filter(
    (meter) => meter.status === "active",
  );
  console.log(meters);
  const customers = await prisma.organization.findMany({
    where: {
      cloudConfig: { not: Prisma.DbNull },
    },
  });

  console.log(customers);

  // timestamp for last 100 day window in seconds
  // Get start of today (midnight UTC) in seconds
  const startOfToday = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);
  const startOfLast100Days = startOfToday - 100 * 24 * 60 * 60;

  const eventSummaries = await stripe.billing.meters.listEventSummaries(
    "mtr_61RMobKGlxIXEHx7j41AWilt2EAVV6ES",
    {
      customer: "cus_Pt238vCOiXZ8ib", //khan
      start_time: startOfLast100Days,
      end_time: startOfToday,
      limit: 100,
      value_grouping_window: "day",
    },
  );

  return res.status(200).json(eventSummaries);
}
