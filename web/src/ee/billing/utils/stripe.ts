import { env } from "@/src/env.mjs";
import Stripe from "stripe";

export const stripeClient =
  env.STRIPE_SECRET_KEY && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
    ? new Stripe(env.STRIPE_SECRET_KEY)
    : undefined;
