import {
  logger,
  fetchWithSecureRedirects,
  validateWebhookURL,
  whitelistFromEnv,
} from "@langfuse/shared/src/server";
import { gzipSync } from "zlib";
import { env } from "../../env";
import { UnrecoverableError } from "../../errors/UnrecoverableError";
import { findOutboundUrlValidationError } from "../../errors/findOutboundUrlValidationError";
import type { MixpanelEvent } from "./transformers";

type MixpanelClientConfig = {
  projectToken: string;
  /**
   * Mixpanel region subdomain (e.g., "api", "api-eu", "api-in")
   * Validated at API layer via MIXPANEL_REGIONS in web/src/features/mixpanel-integration/types.ts
   */
  region: string;
  /**
   * Overrides the Mixpanel API origin (scheme + host [+ port]). Defaults to
   * the region-derived https://<region>.mixpanel.com. Test-only seam so the
   * secure-outbound send can be pointed at a local server to exercise
   * connect-time SSRF pinning; production leaves this unset.
   */
  baseUrl?: string;
};

export class MixpanelClient {
  private config: MixpanelClientConfig;
  private batch: MixpanelEvent[] = [];
  private batchSize = 1000; // Similar to PostHog's flushAt setting
  // Gzipped on-wire bytes sent so far, for the export-volume metric.
  private serializedBytes = 0;

  constructor(config: MixpanelClientConfig) {
    this.config = config;
  }

  /**
   * Total gzipped on-wire bytes sent to Mixpanel across all flushes.
   */
  public getSerializedBytes(): number {
    return this.serializedBytes;
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
    const origin =
      this.config.baseUrl ?? `https://${this.config.region}.mixpanel.com`;
    const url = `${origin}/import?strict=1`;
    const body = JSON.stringify(events);

    // Compress the body with gzip
    const compressedBody = gzipSync(body);
    // Count the gzipped payload as on-wire export volume (sent below).
    this.serializedBytes += compressedBody.length;

    // Create Basic Auth header (token as username, empty password)
    const authHeader = `Basic ${Buffer.from(`${this.config.projectToken}:`).toString("base64")}`;

    // Bound the request so an unresponsive endpoint cannot hold the flush
    // (and the worker job behind it) indefinitely.
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, env.LANGFUSE_MIXPANEL_TIMEOUT_MS);

    try {
      // Re-resolve and re-validate the destination IP at socket connect time so
      // a host that resolves to a public IP during validation but rebinds to a
      // private/loopback address at connect cannot bypass the SSRF check
      // (TOCTOU). Redirect targets are re-validated with the same URL validator.
      const { response } = await fetchWithSecureRedirects(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
            Authorization: authHeader,
          },
          body: compressedBody as unknown as BodyInit,
          signal: abortController.signal,
        },
        {
          maxRedirects: 3,
          redirectValidation: {
            validateUrl: validateWebhookURL,
            whitelist: whitelistFromEnv(),
            logContext: "Mixpanel integration",
          },
        },
      );

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
      if (error instanceof Error && error.name === "AbortError") {
        const timeoutError = new Error(
          `Mixpanel request timed out after ${env.LANGFUSE_MIXPANEL_TIMEOUT_MS}ms`,
        );
        logger.error("Error sending batch to Mixpanel", timeoutError);
        throw timeoutError;
      }
      // A connect-time SSRF/redirect block is a permanent misconfiguration, not
      // a transient failure. Surface it as an UnrecoverableError so BullMQ stops
      // retrying the same blocked send.
      const validationError = findOutboundUrlValidationError(error);
      if (validationError) {
        logger.error(
          `Mixpanel outbound send blocked by secure-outbound validation: ${validationError.message}`,
        );
        const unrecoverable = new UnrecoverableError(
          `Mixpanel export blocked by outbound SSRF protection: ${validationError.message}`,
        );
        unrecoverable.cause = error;
        throw unrecoverable;
      }
      logger.error("Error sending batch to Mixpanel", error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get the current batch size
   */
  public getBatchSize(): number {
    return this.batch.length;
  }
}
