import { env } from "@/src/env.mjs";
import { PostHog as OriginalPosthog } from "posthog-node";

// Safe as it is intended to be public
const PUBLIC_POSTHOG_API_KEY =
  env.NEXT_PUBLIC_POSTHOG_KEY ||
  "phc_zkMwFajk8ehObUlMth0D7DtPItFnxETi3lmSvyQDrwB";
const POSTHOG_HOST = env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com";

export class ServerPosthog extends OriginalPosthog {
  constructor() {
    super(PUBLIC_POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
    });

    if (process.env.NODE_ENV === "development") this.debug();
  }
}
