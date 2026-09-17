import { logger, fetchWithSecureRedirects } from "@langfuse/shared/src/server";
import { gzipSync } from "zlib";
import { env } from "../../env";
import {
  buildAnalyticsRedirectOptions,
  rethrowIfOutboundValidationFailure,
  validateAnalyticsIntegrationUrl,
} from "../analyticsIntegrationEgress";
import type { MixpanelEvent } from "./transformers";

type MixpanelClientConfig = {
  projectToken: string;
  /**
   * Mixpanel region subdomain (e.g., "api", "api-eu", "api-in").
   *
   * The save-time dropdown (`MIXPANEL_REGIONS`) is the only thing that
   * currently keeps this from being a free-form host. The worker treats it
   * as a plain string and interpolates it into `https://<region>.mixpanel.com`.
   * If that dropdown is ever widened (custom host, raw IP, free-form region),
   * `validateAnalyticsIntegrationUrl` is the use-time check that still
   * refuses IP literals, embedded credentials, and non-HTTP schemes — the
   * connect-time DNS hook never fires for a literal, so it cannot cover those.
   */
  region: string;
  /**
   * Overrides the Mixpanel API origin. Test-only seam, so the send can be
   * pointed at a local server; production leaves it unset and derives the
   * origin from `region`.
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
      // Covers what the connect-time lookup cannot see (IP literals, embedded
      // credentials, non-HTTP schemes). Named hosts are left to connect-time
      // pinning, which is strictly stronger than a DNS pre-check.
      validateAnalyticsIntegrationUrl(url);

      // Re-resolve and re-validate the destination IP at socket connect time: a
      // host that validated as public can rebind to a private/loopback address
      // before the socket opens (TOCTOU). Redirect targets are re-validated
      // with the same URL validator.
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
        buildAnalyticsRedirectOptions("Mixpanel integration"),
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
        throw Object.assign(
          new Error(
            `Mixpanel API error: ${response.status} ${response.statusText}`,
          ),
          { statusCode: response.status },
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
      // A connect-time SSRF block is a permanent misconfiguration, not a
      // transient failure, so skip the remaining BullMQ attempts for this job
      // rather than re-running the same hopeless send.
      rethrowIfOutboundValidationFailure(error, {
        logSubject: "Mixpanel outbound send",
        jobSubject: "Mixpanel export",
      });
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
