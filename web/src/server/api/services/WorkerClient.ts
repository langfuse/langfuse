import { env } from "@/src/env.mjs";
import { type EventBodyType } from "@langfuse/shared";

export class WorkerClient {
  readonly enabled: boolean;

  constructor() {
    this.enabled = Boolean(
      env.LANGFUSE_WORKER_HOST &&
        env.LANGFUSE_WORKER_PASSWORD &&
        env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    );

    if (!this.enabled) {
      console.warn("Langfuse Worker is not supported in this environment.");
    }
  }

  async sendEvent(event: EventBodyType): Promise<void> {
    if (!this.enabled) return;

    await fetch(`${env.LANGFUSE_WORKER_HOST}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " +
          Buffer.from("admin" + ":" + env.LANGFUSE_WORKER_PASSWORD).toString(
            "base64",
          ),
      },
      body: JSON.stringify(event),
    }).catch((error) => {
      console.error("Error sending events to worker", error);
    });
  }
}
