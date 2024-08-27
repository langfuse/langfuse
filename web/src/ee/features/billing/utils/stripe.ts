import { env } from "@/src/env.mjs";
import Stripe from "stripe";

export const stripeClient = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY)
  : undefined;
