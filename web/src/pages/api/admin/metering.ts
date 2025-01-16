import { type NextApiRequest, type NextApiResponse } from "next";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { stripeClient } from "@/src/ee/features/billing/utils/stripe";
import { parseDbOrg } from "@langfuse/shared";

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

  const startOfToday = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);
  const startOfLast100Days = startOfToday - 100 * 24 * 60 * 60;

  // purge all existing backups
  await prisma.billingMeterBackup.deleteMany();

  const meters = (await stripe.billing.meters.list()).data.filter(
    (meter) => meter.status === "active",
  );
  const organizations = (
    await prisma.organization.findMany({
      where: {
        cloudConfig: { not: Prisma.DbNull },
      },
    })
  )
    .map(parseDbOrg)
    .filter((org) => org.cloudConfig?.stripe?.customerId);

  for (const meter of meters) {
    for (const org of organizations) {
      // type check
      const stripeCustomerId = org.cloudConfig?.stripe?.customerId;
      if (!stripeCustomerId) continue;

      // timestamp for last 100 day window in seconds
      // Get start of today (midnight UTC) in seconds

      const eventSummaries = await stripe.billing.meters.listEventSummaries(
        meter.id,
        {
          customer: stripeCustomerId,
          start_time: startOfLast100Days,
          end_time: startOfToday,
          limit: 100,
          value_grouping_window: "day",
        },
      );

      await prisma.billingMeterBackup.createMany({
        data: eventSummaries.data.map((event) => ({
          orgId: org.id,
          meterId: meter.id,
          eventName: meter.event_name,
          stripeCustomerId,
          startTime: new Date(event.start_time * 1000),
          endTime: new Date(event.end_time * 1000),
          aggregatedValue: event.aggregated_value,
        })),
      });
    }
  }

  return res.status(200);
}
