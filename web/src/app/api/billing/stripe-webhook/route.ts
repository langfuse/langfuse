import { stripeWebhookHandler } from "@/src/ee/features/billing/server/stripeWebhookHandler";

export const dynamic = "force-dynamic";

export const POST = stripeWebhookHandler;
