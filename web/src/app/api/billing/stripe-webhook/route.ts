import { stripeWebhookApiHandler } from "@/src/ee/features/billing/server/stripeWebhookApiHandler";

export const dynamic = "force-dynamic";

export const POST = stripeWebhookApiHandler;
