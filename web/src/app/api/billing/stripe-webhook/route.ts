import { stripeWebhookHandler } from "@/src/ee/features/billing/server/stripe/stripeWebhookHandler";

export const dynamic = "force-dynamic";

export const POST = stripeWebhookHandler;
