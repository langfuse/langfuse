import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostHog } from "posthog-node";

type PostHogOptions = NonNullable<ConstructorParameters<typeof PostHog>[1]>;
type PostHogFetch = NonNullable<PostHogOptions["fetch"]>;
type PostHogFetchOptions = Parameters<PostHogFetch>[1];
type PostHogFetchResponse = Awaited<ReturnType<PostHogFetch>>;

const okResponse = (): PostHogFetchResponse => ({
  status: 200,
  text: async () => "",
  json: async () => ({}),
  headers: { get: () => null },
});

const decodeBatch = async (options: PostHogFetchOptions) => {
  const { body } = options;
  let buffer: Buffer;
  if (typeof body === "string") {
    buffer = Buffer.from(body);
  } else if (body instanceof Blob) {
    buffer = Buffer.from(await body.arrayBuffer());
  } else {
    throw new Error(`Unexpected PostHog request body: ${typeof body}`);
  }
  if (options.headers["Content-Encoding"] === "gzip") {
    buffer = gunzipSync(buffer);
  }
  return JSON.parse(buffer.toString("utf8")) as {
    batch: Array<{ uuid?: string }>;
  };
};

describe("posthog-node delivery contract", () => {
  beforeEach(() => vi.stubEnv("POSTHOG_CAPTURE_MODE", "v0"));
  afterEach(() => vi.unstubAllEnvs());

  it("applies awaited backpressure and delivers every captured event", async () => {
    const eventCount = 10_005;
    const expectedUuids = Array.from(
      { length: eventCount },
      (_, index) =>
        `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    );
    const deliveredUuids: string[] = [];
    let resolveFirstRequest!: () => void;
    const firstRequestStarted = new Promise<void>((resolve) => {
      resolveFirstRequest = resolve;
    });
    let releaseFirstRequest!: () => void;
    const firstRequestGate = new Promise<void>((resolve) => {
      releaseFirstRequest = resolve;
    });
    let requestCount = 0;

    const fetch: PostHogFetch = async (url, options) => {
      requestCount++;
      if (requestCount === 1) {
        resolveFirstRequest();
      }
      expect(url.endsWith("/batch/")).toBe(true);
      expect(options.headers["Content-Encoding"]).toBe("gzip");
      expect(options.body).toBeInstanceOf(Blob);
      const payload = await decodeBatch(options);
      deliveredUuids.push(
        ...payload.batch.flatMap((event) => (event.uuid ? [event.uuid] : [])),
      );
      if (requestCount === 1) {
        await firstRequestGate;
      }
      return okResponse();
    };

    const client = new PostHog("phc_delivery_test", {
      host: "https://posthog.invalid",
      flushAt: 1_000,
      maxQueueSize: 10_000,
      flushInterval: 60_000,
      fetch,
    });
    let shutdownComplete = false;
    let exportRun: Promise<void> | undefined;

    try {
      let produced = 0;
      exportRun = (async () => {
        for (let index = 0; index < eventCount; index++) {
          produced++;
          client.capture({
            distinctId: "langfuse-project",
            event: "langfuse observation",
            properties: { exportId: `observation-${index}` },
            uuid: expectedUuids[index],
          });
          if (produced % 1_000 === 0) {
            await client.flush();
          }
        }
        if (produced % 1_000 !== 0) {
          await client.flush();
        }
      })();

      await firstRequestStarted;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(produced).toBe(1_000);

      releaseFirstRequest();
      await exportRun;

      expect(deliveredUuids).toHaveLength(eventCount);
      expect(new Set(deliveredUuids)).toEqual(new Set(expectedUuids));

      await client.shutdown();
      shutdownComplete = true;
    } finally {
      releaseFirstRequest();
      await exportRun?.catch(() => {});
      if (!shutdownComplete) {
        await client.shutdown().catch(() => {});
      }
    }
  });

  it("rejects flush when the capture endpoint rejects a batch", async () => {
    const sendErrors: Error[] = [];
    const fetch: PostHogFetch = async () => ({
      status: 500,
      text: async () => "capture failed",
      json: async () => ({}),
      headers: { get: () => null },
    });
    const client = new PostHog("phc_delivery_test", {
      host: "https://posthog.invalid",
      flushAt: 1_000,
      maxQueueSize: 10_000,
      fetchRetryCount: 0,
      fetchRetryDelay: 0,
      fetch,
    });
    client.on("error", (error) => {
      sendErrors.push(
        error instanceof Error ? error : new Error(String(error)),
      );
    });

    try {
      client.capture({
        distinctId: "langfuse-project",
        event: "langfuse observation",
        properties: { exportId: "observation-1" },
      });

      await expect(client.flush()).rejects.toThrow(
        "HTTP error while fetching PostHog",
      );
      expect(sendErrors).toHaveLength(1);
    } finally {
      await client.shutdown();
    }
  });

  it("emits a delivery error but resolves shutdown after a rejected batch", async () => {
    const sendErrors: Error[] = [];
    const fetch: PostHogFetch = async () => ({
      status: 500,
      text: async () => "capture failed",
      json: async () => ({}),
      headers: { get: () => null },
    });
    const client = new PostHog("phc_delivery_test", {
      host: "https://posthog.invalid",
      flushAt: 1_000,
      maxQueueSize: 10_000,
      fetchRetryCount: 0,
      fetchRetryDelay: 0,
      fetch,
    });
    client.on("error", (error) => {
      sendErrors.push(
        error instanceof Error ? error : new Error(String(error)),
      );
    });
    client.capture({
      distinctId: "langfuse-project",
      event: "langfuse observation",
      properties: { exportId: "observation-1" },
    });

    await expect(client.shutdown()).resolves.toBeUndefined();
    expect(sendErrors).toHaveLength(1);
  });
});
