import { stripeWebhookHandler } from "@/src/ee/features/billing/server/stripeWebhookHandler";
import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return stripeWebhookHandler(req);
}
