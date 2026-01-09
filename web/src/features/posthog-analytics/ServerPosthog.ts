import { env } from "@/src/env.mjs";
import { PostHog } from "posthog-node";

export class ServerPosthog {
  private posthog: PostHog | null;

  constructor() {
    if (env.NEXT_PUBLIC_POSTHOG_KEY && env.NEXT_PUBLIC_POSTHOG_HOST) {
      this.posthog = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
        host: env.NEXT_PUBLIC_POSTHOG_HOST,
      });
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
