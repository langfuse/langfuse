import type { ParseRequest, ParseResponse } from "./json-parser.protocol";

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mockCaptureException,
  addBreadcrumb: vi.fn(),
}));

/**
 * The contract this module exists for: a parse request ALWAYS settles.
 *
 * The worker used to be started from a bundler chunk that 404s in any tab
 * outliving a deploy, and `onerror` only reported — it never rejected the
 * pending callbacks, never cleared the singleton and had no deadline. So the
 * promise never settled, the Raw tab sat on "Parsing in background…" forever,
 * and every later payload posted into the same dead worker: one Sentry event,
 * unboundedly many stuck panels (Sentry LANGFUSE-5TT / -546 / -57N, ~796
 * events / 14d).
 */

/** Stands in for the browser Worker: records posts, never runs anything. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<ParseResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: ParseRequest[] = [];
  terminated = false;

  constructor(public readonly url: string) {
    FakeWorker.instances.push(this);
  }

  postMessage(request: ParseRequest) {
    this.posted.push(request);
  }

  terminate() {
    this.terminated = true;
  }

  /** Answer a request the way the real worker would. */
  answer(request: ParseRequest, response: Partial<ParseResponse> = {}) {
    this.onmessage?.({
      data: {
        id: request.id,
        parsedInput: "worker-parsed",
        parsedOutput: null,
        parsedMetadata: null,
        parseTime: 12,
        ...response,
      },
    } as MessageEvent<ParseResponse>);
  }

  fail() {
    const event = new ErrorEvent("error", {
      message: "Uncaught NetworkError: the worker script failed to load",
      filename: "blob:https://app.example/9f2c",
      lineno: 1,
      colno: 1,
    });
    const preventDefault = vi.spyOn(event, "preventDefault");
    this.onerror?.(event);
    return preventDefault;
  }
}

/** Over PARSE_IN_WEBWORKER_THRESHOLD, so it is worth a round trip. */
const BIG_IO = JSON.stringify({ deep: "x".repeat(110_000) });
/** Under it: parsed on this thread, the worker is never involved. */
const SMALL_IO = JSON.stringify({ deep: "small" });

// jsdom implements neither, and `URL` itself must stay a real constructor.
const createObjectURL = vi.fn(() => "blob:fake-worker-url");
const revokeObjectURL = vi.fn();
const urlStatics = URL as unknown as {
  createObjectURL?: unknown;
  revokeObjectURL?: unknown;
};

// Module state (the worker instance, the pending map) is per-import.
async function loadClient() {
  vi.resetModules();
  return import("./jsonParserWorkerClient");
}

const parse = async (
  client: Awaited<ReturnType<typeof loadClient>>,
  io: unknown,
) =>
  client.parseIoOffThread({
    source: "useParsedTrace",
    input: io,
    output: null,
    metadata: null,
  });

describe("parseIoOffThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
    urlStatics.createObjectURL = createObjectURL;
    urlStatics.revokeObjectURL = revokeObjectURL;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete urlStatics.createObjectURL;
    delete urlStatics.revokeObjectURL;
  });

  it("parses small payloads on this thread without starting a worker", async () => {
    const client = await loadClient();

    await expect(parse(client, SMALL_IO)).resolves.toMatchObject({
      input: { deep: "small" },
    });
    expect(FakeWorker.instances).toHaveLength(0);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("starts the worker from a blob, never from a URL that can 404", async () => {
    const client = await loadClient();
    const pending = parse(client, BIG_IO);

    const [worker] = FakeWorker.instances;
    expect(worker).toBeDefined();
    expect(worker!.url).toBe("blob:fake-worker-url");
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    worker!.answer(worker!.posted[0]!);
    await expect(pending).resolves.toMatchObject({ input: "worker-parsed" });
  });

  it("reuses one worker and hands it one request at a time", async () => {
    const client = await loadClient();
    const first = parse(client, BIG_IO);
    const second = parse(client, BIG_IO);

    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0]!;
    // The worker is single-threaded; queueing inside it would only hide the
    // wait from the deadline.
    expect(worker.posted).toHaveLength(1);

    worker.answer(worker.posted[0]!, { parsedInput: "first" });
    await expect(first).resolves.toMatchObject({ input: "first" });

    expect(worker.posted).toHaveLength(2);
    worker.answer(worker.posted[1]!, { parsedInput: "second" });
    await expect(second).resolves.toMatchObject({ input: "second" });
  });

  it("ignores an answer to a request it is no longer waiting on", async () => {
    const client = await loadClient();
    const pending = parse(client, BIG_IO);
    const worker = FakeWorker.instances[0]!;
    const request = worker.posted[0]!;

    worker.answer({ ...request, id: "not-the-one-in-flight" });
    worker.answer(request, { parsedInput: "the right one" });

    await expect(pending).resolves.toMatchObject({ input: "the right one" });
  });

  it("rejects when the worker reports a parse failure", async () => {
    const client = await loadClient();
    const pending = parse(client, BIG_IO);
    const worker = FakeWorker.instances[0]!;

    worker.answer(worker.posted[0]!, { error: "Maximum call stack exceeded" });

    await expect(pending).rejects.toThrow("Maximum call stack exceeded");
  });

  describe("when the worker script fails to load", () => {
    it("settles the in-flight request on this thread instead of hanging", async () => {
      const client = await loadClient();
      const pending = parse(client, BIG_IO);
      const worker = FakeWorker.instances[0]!;

      worker.fail();

      // The payload is really parsed, not handed back untouched.
      await expect(pending).resolves.toMatchObject({
        input: { deep: "x".repeat(110_000) },
      });
      expect(worker.terminated).toBe(true);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-worker-url");
    });

    it("cancels the event so the browser does not re-report it on window", async () => {
      const client = await loadClient();
      const pending = parse(client, BIG_IO);
      const worker = FakeWorker.instances[0]!;

      const preventDefault = worker.fail();
      await pending;

      // Uncanceled, the same failure fires again at window.onerror, where
      // Sentry captures it unhandled: ~half of this error family's volume.
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
    });

    it("stops starting a worker that cannot run", async () => {
      const client = await loadClient();
      const first = parse(client, BIG_IO);
      FakeWorker.instances[0]!.fail();
      await first;

      await expect(parse(client, BIG_IO)).resolves.toMatchObject({
        input: { deep: "x".repeat(110_000) },
      });
      expect(FakeWorker.instances).toHaveLength(1);
    });
  });

  describe("waiting in the queue", () => {
    it("starts a request's deadline when the worker takes it, not when it is asked for", async () => {
      vi.useFakeTimers();
      const client = await loadClient();
      const first = parse(client, BIG_IO);
      const second = parse(client, BIG_IO);
      const worker = FakeWorker.instances[0]!;

      // A slow but entirely healthy first parse, answered just inside its own
      // deadline. The second request has been waiting for all of it.
      await vi.advanceTimersByTimeAsync(client.PARSE_DEADLINE_MS - 1_000);
      worker.answer(worker.posted[0]!, { parsedInput: "slow but fine" });
      await expect(first).resolves.toMatchObject({ input: "slow but fine" });

      // Timing the queued request from when it was asked for would fire its
      // deadline here and kill a worker that is answering normally.
      await vi.advanceTimersByTimeAsync(2_000);
      expect(worker.terminated).toBe(false);
      expect(mockCaptureException).not.toHaveBeenCalled();

      worker.answer(worker.posted[1]!, { parsedInput: "second" });
      await expect(second).resolves.toMatchObject({ input: "second" });
    });

    it("re-dispatches what was only queued instead of parsing it here", async () => {
      vi.useFakeTimers();
      const client = await loadClient();
      const inFlight = parse(client, BIG_IO);
      const queued = parse(client, BIG_IO);
      const dead = FakeWorker.instances[0]!;

      await vi.advanceTimersByTimeAsync(client.PARSE_DEADLINE_MS);
      // Only the request the worker actually held is unanswerable; the one
      // behind it was never tried, so it does not belong on the main thread.
      await expect(inFlight).resolves.toMatchObject({
        input: { deep: "x".repeat(110_000) },
      });
      expect(dead.terminated).toBe(true);

      expect(FakeWorker.instances).toHaveLength(2);
      const fresh = FakeWorker.instances[1]!;
      expect(fresh.posted).toHaveLength(1);
      fresh.answer(fresh.posted[0]!, { parsedInput: "ran on the new worker" });
      await expect(queued).resolves.toMatchObject({
        input: "ran on the new worker",
      });
    });
  });

  describe("when the worker dies without saying so", () => {
    it("falls back to this thread once the deadline passes", async () => {
      vi.useFakeTimers();
      const client = await loadClient();
      const pending = parse(client, BIG_IO);
      const worker = FakeWorker.instances[0]!;

      await vi.advanceTimersByTimeAsync(client.PARSE_DEADLINE_MS);

      await expect(pending).resolves.toMatchObject({
        input: { deep: "x".repeat(110_000) },
      });
      expect(worker.terminated).toBe(true);
    });

    it("reports the outcome, which is otherwise invisible", async () => {
      vi.useFakeTimers();
      const client = await loadClient();
      const pending = parse(client, BIG_IO);

      await vi.advanceTimersByTimeAsync(client.PARSE_DEADLINE_MS);
      await pending;

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [error, options] = mockCaptureException.mock.calls[0]!;
      expect((error as Error).message).toContain("did not answer within");
      expect(options).toMatchObject({
        tags: { area: "io-parse-worker", outcome: "deadline-fallback" },
        extra: { workerHook: "useParsedTrace", payloadChars: BIG_IO.length },
      });
    });

    it("does not retire the worker on a single miss", async () => {
      vi.useFakeTimers();
      const client = await loadClient();
      const first = parse(client, BIG_IO);
      await vi.advanceTimersByTimeAsync(client.PARSE_DEADLINE_MS);
      await first;

      parse(client, BIG_IO).catch(() => undefined);
      expect(FakeWorker.instances).toHaveLength(2);
    });

    it("retires it once missing the deadline is the pattern", async () => {
      vi.useFakeTimers();
      const client = await loadClient();

      for (let attempt = 0; attempt < 2; attempt++) {
        const pending = parse(client, BIG_IO);
        await vi.advanceTimersByTimeAsync(client.PARSE_DEADLINE_MS);
        await pending;
      }

      await parse(client, BIG_IO);
      expect(FakeWorker.instances).toHaveLength(2);
    });

    it("ignores an answer that arrives after the deadline", async () => {
      vi.useFakeTimers();
      const client = await loadClient();
      const pending = parse(client, BIG_IO);
      const worker = FakeWorker.instances[0]!;
      const request = worker.posted[0]!;

      await vi.advanceTimersByTimeAsync(client.PARSE_DEADLINE_MS);
      await pending;

      // A terminated worker cannot really answer, but a late message must not
      // settle a request twice or throw.
      expect(() => worker.answer(request)).not.toThrow();
      await expect(pending).resolves.toMatchObject({
        input: { deep: "x".repeat(110_000) },
      });
    });
  });
});
