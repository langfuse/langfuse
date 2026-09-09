import { env } from "@/src/env.mjs";
import { isProductAnalyticsAvailable } from "@/src/features/posthog-analytics/productAnalyticsAvailability";
import { PostHog } from "posthog-node";

const FALLBACK_POSTHOG_KEY = "phc_zkMwFajk8ehObUlMth0D7DtPItFnxETi3lmSvyQDrwB";
const FALLBACK_POSTHOG_HOST = "https://eu.posthog.com";

export class ServerPosthog {
  private posthog: PostHog | null;
  private optOut: Promise<void> | undefined;

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
      // Unlike the browser SDK, posthog-node disable() is a local opt-out:
      // capture becomes a no-op and nothing is sent. HIPAA uses this instead
      // of skipping construction. The flag flips synchronously; the promise is
      // kept so the constructor does not float it.
      if (!isProductAnalyticsAvailable()) {
        this.optOut = this.posthog.disable();
      }
    } else {
      this.posthog = null;
    }
  }

  capture(...args: Parameters<PostHog["capture"]>) {
    this.posthog?.capture(...args);
  }

  async shutdown() {
    await this.optOut;
    await this.posthog?.shutdown();
  }

  async flush() {
    await this.posthog?.flush();
  }
}
