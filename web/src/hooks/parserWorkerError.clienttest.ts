import { reportParserWorkerError } from "@/src/hooks/parserWorkerError";
import { captureException } from "@sentry/nextjs";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const mockCaptureException = vi.mocked(captureException);

/**
 * Observability contract for the JSON-parser Web Worker `onerror` path
 * (Sentry LANGFUSE-421 / LANGFUSE-41Z). The raw ErrorEvent used to be
 * `console.error`'d and then stringified by captureConsoleIntegration to the
 * opaque "[object ErrorEvent]", discarding message/filename/lineno.
 * `reportParserWorkerError` must instead capture ONE legible Error with
 * structured context, and log via `console.warn` (never `console.error`) so the
 * same failure is not double-captured.
 */
describe("reportParserWorkerError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeErrorEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
    return {
      message: "ChunkLoadError: Loading chunk 123 failed",
      filename: "https://app.example/_next/static/chunks/worker.js",
      lineno: 1,
      colno: 42,
      error: undefined,
      ...overrides,
    } as ErrorEvent;
  }

  it("captures a synthesized, legible Error with structured context when event.error is absent", () => {
    const event = makeErrorEvent();
    reportParserWorkerError("useParsedTrace", event);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [err, opts] = mockCaptureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain(
      "[useParsedTrace] worker failed to load",
    );
    expect((err as Error).message).toContain(event.message);
    expect((err as Error).message).toContain(event.filename);
    // The fields captureConsoleIntegration used to discard are preserved.
    expect(opts).toMatchObject({
      extra: {
        workerHook: "useParsedTrace",
        message: event.message,
        filename: event.filename,
        lineno: 1,
        colno: 42,
      },
      tags: { area: "io-parse-worker" },
    });
  });

  it("prefers the real Error when the worker threw during init", () => {
    const real = new Error("worker init threw");
    reportParserWorkerError(
      "useParsedObservation",
      makeErrorEvent({ error: real }),
    );

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException.mock.calls[0][0]).toBe(real);
  });

  it("logs a readable string via console.warn, not console.error (no double-capture)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    reportParserWorkerError("useParsedTrace", makeErrorEvent());

    // console.error would be re-captured by captureConsoleIntegration.
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(logged).toContain("[useParsedTrace] Worker failed to load");
    expect(logged).not.toContain("[object ErrorEvent]");

    warn.mockRestore();
    error.mockRestore();
  });

  it("degrades gracefully when ErrorEvent fields are empty", () => {
    reportParserWorkerError(
      "useParsedTrace",
      makeErrorEvent({ message: "", filename: "" }),
    );

    const [err] = mockCaptureException.mock.calls[0];
    expect((err as Error).message).toContain("unknown");
    expect((err as Error).message).toContain("?");
  });
});
