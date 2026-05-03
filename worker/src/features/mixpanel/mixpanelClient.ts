import { logger } from "@langfuse/shared/src/server";
import { gzipSync } from "zlib";
import type { MixpanelEvent } from "./transformers";

type MixpanelClientConfig = {
  projectToken: string;
  /**
   * Mixpanel region subdomain (e.g., "api", "api-eu", "api-in")
   * Validated at API layer via MIXPANEL_REGIONS in web/src/features/mixpanel-integration/types.ts
   */
  region: string;
};

export class MixpanelClient {
  private config: MixpanelClientConfig;
  private batch: MixpanelEvent[] = [];
  private batchSize = 1000; // Similar to PostHog's flushAt setting

  constructor(config: MixpanelClientConfig) {
    this.config = config;
  }

  /**
   * Add an event to the batch
   */
  public addEvent(event: MixpanelEvent): void {
    this.batch.push(event);
  }

  /**
   * Send all batched events to Mixpanel
   */
  public async flush(): Promise<void> {
    if (this.batch.length === 0) {
      return;
    }

    // Send events in chunks of batchSize (max 2000 per Mixpanel API limits, we use 1000 for consistency with PostHog)
    const chunks: MixpanelEvent[][] = [];
    for (let i = 0; i < this.batch.length; i += this.batchSize) {
      chunks.push(this.batch.slice(i, i + this.batchSize));
    }

    for (const chunk of chunks) {
      await this.sendBatch(chunk);
    }

    // Clear the batch after sending
    this.batch = [];
  }

  /**
   * Send a batch of events to Mixpanel Import API
   */
  private async sendBatch(events: MixpanelEvent[]): Promise<void> {
    const url = `https://${this.config.region}.mixpanel.com/import?strict=1`;
    const body = JSON.stringify(events);

    // Compress the body with gzip
    const compressedBody = gzipSync(body);

    // Create Basic Auth header (token as username, empty password)
    const authHeader = `Basic ${Buffer.from(`${this.config.projectToken}:`).toString("base64")}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
          Authorization: authHeader,
        },
        body: compressedBody as unknown as BodyInit,
      });

      if (!response.ok) {
        const errorText = await response.text();

        // On 400, Mixpanel may report partial success (some records imported,
        // some rejected). Only throw when zero records were imported.
        if (response.status === 400) {
          try {
            const body = JSON.parse(errorText) as {
              code?: number;
              num_records_imported?: number;
              failed_records?: Array<{
                index: number;
                insert_id: string;
                field: string;
                message: string;
              }>;
            };

            if (body.num_records_imported && body.num_records_imported > 0) {
              logger.warn(
                `Mixpanel partial success: ${body.num_records_imported}/${events.length} records imported, ${body.failed_records?.length ?? 0} failed`,
                { failed_records: body.failed_records },
              );
              return;
            }
          } catch {
            // JSON parse failed — fall through to throw
          }
        }

        logger.error(
          `Failed to send events to Mixpanel: ${response.status} ${response.statusText}`,
          { body: errorText },
        );
        throw new Error(
          `Mixpanel API error: ${response.status} ${response.statusText}`,
        );
      }

      const result = await response.json();
      logger.debug("Successfully sent batch to Mixpanel", {
        count: events.length,
        result,
      });
    } catch (error) {
      logger.error("Error sending batch to Mixpanel", error);
      throw error;
    }
  }

  /**
   * Get the current batch size
   */
  public getBatchSize(): number {
    return this.batch.length;
  }
}
