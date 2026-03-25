import { createHash, createHmac, randomUUID } from "crypto";
import { logger } from "@langfuse/shared/src/server";

type KubitEvent = Record<string, unknown> & { entity_type: string };

// Kinesis PutRecords hard limits
const KINESIS_MAX_RECORDS_PER_CALL = 250;
const KINESIS_MAX_BYTES_PER_CALL = 5 * 1024 * 1024; // 5 MB

const MAX_RETRIES = 5;

// Flush the in-memory buffer every 25 MB to bound peak memory usage during
// large historical syncs.
const FLUSH_THRESHOLD_BYTES = 25 * 1024 * 1024; // 25 MB

// One PutRecords call at a time per processor — up to 4 processors run in
// parallel (traces + observations + scores + enriched observations), so total
// in-flight is at most 4 concurrent calls. Higher concurrency causes thundering
// herd during backfills: retries from failed batches overlap with new batches
// and compound the throttling.
const PUT_RECORDS_CONCURRENCY = 1;

// ── SigV4 helpers

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac("AWS4" + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function buildAuthorizationHeader(params: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  region: string;
  amzDate: string;
  dateStamp: string;
  host: string;
  bodyHash: string;
  target: string;
}): string {
  const {
    accessKeyId,
    secretAccessKey,
    sessionToken,
    region,
    amzDate,
    dateStamp,
    host,
    bodyHash,
    target,
  } = params;

  const service = "kinesis";

  const canonicalHeaders = [
    `content-type:application/x-amz-json-1.1`,
    `host:${host}`,
    `x-amz-date:${amzDate}`,
    `x-amz-security-token:${sessionToken}`,
    `x-amz-target:${target}`,
  ].join("\n");

  const signedHeaders =
    "content-type;host;x-amz-date;x-amz-security-token;x-amz-target";

  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders + "\n",
    signedHeaders,
    bodyHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign).toString("hex");

  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

// ── Kinesis types ──

type KinesisRecord = { Data: string; PartitionKey: string };

type PutRecordsResponse = {
  FailedRecordCount: number;
  Records: Array<{
    SequenceNumber?: string;
    ShardId?: string;
    ErrorCode?: string;
    ErrorMessage?: string;
  }>;
};

// ── KubitClient ──

export class KubitClient {
  private readonly awsAccessKeyId: string;
  private readonly awsSecretAccessKey: string;
  private readonly awsSessionToken: string;
  private readonly awsRegion: string;
  private readonly streamName: string;
  private readonly projectId: string;
  private readonly workspaceId: string;
  private readonly requestTimeoutMs: number;
  private batch: KubitEvent[] = [];
  private batchBytes = 0;

  constructor({
    awsAccessKeyId,
    awsSecretAccessKey,
    awsSessionToken,
    awsRegion,
    streamName,
    projectId,
    workspaceId,
    requestTimeoutSeconds,
  }: {
    awsAccessKeyId: string;
    awsSecretAccessKey: string;
    awsSessionToken: string;
    awsRegion: string;
    streamName: string;
    projectId: string;
    workspaceId: string;
    requestTimeoutSeconds: number;
  }) {
    this.awsAccessKeyId = awsAccessKeyId;
    this.awsSecretAccessKey = awsSecretAccessKey;
    this.awsSessionToken = awsSessionToken;
    this.awsRegion = awsRegion;
    this.streamName = streamName;
    this.projectId = projectId;
    this.workspaceId = workspaceId;
    this.requestTimeoutMs = requestTimeoutSeconds * 1000;
  }

  /** No-op — kept for API compatibility. Built-in fetch manages connections automatically. */
  public async destroy(): Promise<void> {}

  /**
   * Enrich the event with the workspace id
   */
  public addEvent(event: KubitEvent): void {
    const enriched: KubitEvent = { ...event, wid: this.workspaceId };
    const eventBytes = Buffer.byteLength(JSON.stringify(enriched), "utf8");
    this.batch.push(enriched);
    this.batchBytes += eventBytes;
  }

  /**
   * Returns true when the in-memory buffer has reached FLUSH_THRESHOLD_BYTES —
   * signal to the caller to call flush() to bound peak memory usage.
   */
  public shouldFlush(): boolean {
    return this.batchBytes >= FLUSH_THRESHOLD_BYTES;
  }

  public async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    // Split buffered events into PutRecords calls, each respecting:
    //   • ≤ 250 records per call (configured limit, below Kinesis hard limit of 500)
    //   • ≤ 5 MB total per call (Kinesis hard limit)
    // Each Kinesis record carries exactly one enriched event as a
    // base64-encoded JSON string.
    const calls: KubitEvent[][] = [];
    let currentCall: KubitEvent[] = [];
    let currentCallBytes = 0;

    for (const event of this.batch) {
      const eventBytes = Buffer.byteLength(JSON.stringify(event), "utf8");

      const wouldExceedCount =
        currentCall.length >= KINESIS_MAX_RECORDS_PER_CALL;
      const wouldExceedBytes =
        currentCall.length > 0 &&
        currentCallBytes + eventBytes > KINESIS_MAX_BYTES_PER_CALL;

      if (wouldExceedCount || wouldExceedBytes) {
        calls.push(currentCall);
        currentCall = [];
        currentCallBytes = 0;
      }

      currentCall.push(event);
      currentCallBytes += eventBytes;
    }

    if (currentCall.length > 0) {
      calls.push(currentCall);
    }

    // Fire PutRecords calls in concurrency-limited batches over keep-alive
    // connections — pipelining reduces round-trip wait while PUT_RECORDS_CONCURRENCY
    // caps simultaneous in-flight uploads to avoid saturating the worker's network.
    for (let i = 0; i < calls.length; i += PUT_RECORDS_CONCURRENCY) {
      await Promise.all(
        calls
          .slice(i, i + PUT_RECORDS_CONCURRENCY)
          .map((callEvents) => this.sendChunkWithRetry(callEvents)),
      );
    }

    this.batch = [];
    this.batchBytes = 0;
  }

  private async sendChunkWithRetry(events: KubitEvent[]): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.putRecords(events);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) {
          // Exponential backoff with ±25% jitter so the 3 parallel processors
          // don't all retry at the same instant (thundering herd).
          const base = 5000 * Math.pow(2, attempt - 1); // 5s → 10s → 20s
          const jitter = base * 0.25 * (Math.random() * 2 - 1); // ±25%
          const delayMs = Math.round(base + jitter);
          logger.warn(
            `[KUBIT] Attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delayMs}ms`,
            { error: lastError.message },
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }

  /**
   * Sends events to Kinesis, retrying only the throttled records on partial
   * failures (FailedRecordCount > 0). Serialises each event once and reuses
   * the KinesisRecord across retry attempts to avoid redundant work.
   */
  private async putRecords(events: KubitEvent[]): Promise<void> {
    // Serialise once — reused across partial-failure retry attempts.
    // Partition key format: "{wid}/{event.id}"
    const eventId = (event: KubitEvent) =>
      typeof event.id === "string" && event.id ? event.id : randomUUID();
    let pending: KinesisRecord[] = events.map((event) => ({
      Data: Buffer.from(JSON.stringify(event)).toString("base64"),
      PartitionKey: `${this.workspaceId}/${eventId(event)}`,
    }));

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const result = await this.callPutRecords(pending);

      if (result.FailedRecordCount === 0) {
        logger.debug("[KUBIT] Successfully sent Kinesis batch", {
          records: pending.length,
          wid: this.workspaceId,
        });
        return;
      }

      // Collect only the throttled/failed records by index for the next attempt.
      const failed = result.Records.reduce<KinesisRecord[]>((acc, r, i) => {
        if (r.ErrorCode) acc.push(pending[i]);
        return acc;
      }, []);

      const errorCodes = [
        ...new Set(
          result.Records.filter((r) => r.ErrorCode).map((r) => r.ErrorCode),
        ),
      ];
      logger.warn(
        `[KUBIT] Partial PutRecords failure — failed=${failed.length}/${pending.length} attempt=${attempt} errorCodes=${errorCodes.join(",")} wid=${this.workspaceId}`,
      );

      if (attempt === MAX_RETRIES) break;

      const delayMs = 1000 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      pending = failed;
    }

    throw new Error(
      `[KUBIT] ${pending.length} records failed after ${MAX_RETRIES} attempts`,
    );
  }

  /** Raw HTTP PutRecords call — throws on HTTP errors, returns parsed response. */
  private async callPutRecords(
    records: KinesisRecord[],
  ): Promise<PutRecordsResponse> {
    const host = `kinesis.${this.awsRegion}.amazonaws.com`;
    const target = "Kinesis_20131202.PutRecords";

    const body = JSON.stringify({
      StreamName: this.streamName,
      Records: records,
    });
    const bodyHash = sha256Hex(body);

    const now = new Date();
    const amzDate = now
      .toISOString()
      .replace(/[:-]/g, "")
      .replace(/\.\d{3}/, "");
    const dateStamp = amzDate.slice(0, 8);

    const authorization = buildAuthorizationHeader({
      accessKeyId: this.awsAccessKeyId,
      secretAccessKey: this.awsSecretAccessKey,
      sessionToken: this.awsSessionToken,
      region: this.awsRegion,
      amzDate,
      dateStamp,
      host,
      bodyHash,
      target,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );

    try {
      const response = await fetch(`https://${host}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-amz-json-1.1",
          Host: host,
          "X-Amz-Date": amzDate,
          "X-Amz-Security-Token": this.awsSessionToken,
          "X-Amz-Target": target,
          Authorization: authorization,
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          `[KUBIT] Kinesis PutRecords HTTP error: ${response.status} ${response.statusText}`,
          { body: errorText },
        );
        throw new Error(
          `Kinesis PutRecords error: ${response.status} ${response.statusText}`,
        );
      }

      return response.json() as Promise<PutRecordsResponse>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public getBatchSize(): number {
    return this.batch.length;
  }
}
