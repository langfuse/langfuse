import { env } from "@/src/env.mjs";
import {
  instrumentAsync,
  type EventBodyType,
  type IngestionApiSchemaWithProjectId,
} from "@langfuse/shared/src/server";

export class WorkerClient {
  readonly enabled: boolean;

  constructor() {
    this.enabled = Boolean(
      env.LANGFUSE_WORKER_HOST && env.LANGFUSE_WORKER_PASSWORD,
    );

    if (!this.enabled) {
      console.warn("Langfuse Worker is not supported in this environment.");
    }
  }

  async sendEvent(event: EventBodyType): Promise<void> {
    if (!this.enabled) return;

    await this.sendWorkerRequest({
      method: "POST",
      route: "/api/events",
      body: event,
    }).catch((error) => {
      console.error("Error sending events to worker", error);
    });
  }

  async sendIngestionBatch(params: IngestionApiSchemaWithProjectId) {
    await instrumentAsync({ name: "insert-clickhouse" }, async () => {
      await this.sendWorkerRequest({
        method: "POST",
        route: "/api/ingestion",
        body: params,
      }).catch((error) => {
        console.error("Error sending events to worker", error);
      });
    });
  }

  private async sendWorkerRequest(params: {
    route: string;
    method: "POST";
    body: any;
  }) {
    const { route, method, body } = params;

    return fetch(env.LANGFUSE_WORKER_HOST + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " +
          Buffer.from("admin" + ":" + env.LANGFUSE_WORKER_PASSWORD).toString(
            "base64",
          ),
      },
      body: JSON.stringify(body),
    });
  }
}
