import { stripeWebhookApiHandler } from "@/src/ee/features/billing/stripeWebhookApiHandler";

export const dynamic = "force-dynamic";

export const POST = stripeWebhookApiHandler;
