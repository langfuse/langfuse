import { env } from "@/src/env.mjs";
import { PostHog } from "posthog-node";

const FALLBACK_POSTHOG_KEY = "phc_zkMwFajk8ehObUlMth0D7DtPItFnxETi3lmSvyQDrwB";
const FALLBACK_POSTHOG_HOST = "https://eu.posthog.com";

export class ServerPosthog {
  private posthog: PostHog | null;

  constructor() {
    const telemetryEnabled = env.TELEMETRY_ENABLED !== "false";

    const apiKey =
      env.NEXT_PUBLIC_POSTHOG_KEY ??
      (telemetryEnabled ? FALLBACK_POSTHOG_KEY : null);
    const host =
      env.NEXT_PUBLIC_POSTHOG_HOST ??
      (telemetryEnabled ? FALLBACK_POSTHOG_HOST : null);

    if (apiKey && host) {
      this.posthog = new PostHog(apiKey, { host });
      if (process.env.NODE_ENV === "development") this.posthog.debug();
    } else {
      this.posthog = null;
    }
  }

  capture(...args: Parameters<PostHog["capture"]>) {
    this.posthog?.capture(...args);
  }

  async shutdown() {
    await this.posthog?.shutdown();
  }

  async flush() {
    await this.posthog?.flush();
  }
}
