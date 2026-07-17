import { captureUnknownError } from "@/src/utils/captureUnknownError";

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

describe("captureUnknownError", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureExceptionMock.mockClear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("passes a real Error through untouched (preserves the instance/stack)", () => {
    const original = new Error("boom");
    captureUnknownError("test.ctx", original);

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const call = captureExceptionMock.mock.calls[0];
    expect(call).toBeDefined();
    const [err, options] = call!;
    expect(err).toBe(original); // same instance → original stack preserved
    expect(options.extra.context).toBe("test.ctx");
    expect(options.tags.area).toBe("test.ctx");
  });

  it("wraps a string as `[context] string`", () => {
    captureUnknownError("test.ctx", "something failed");

    const [err] = captureExceptionMock.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("[test.ctx] something failed");
  });

  it("renders a plain object legibly (not [object Object])", () => {
    captureUnknownError("test.ctx", { code: 42, reason: "bad" });

    const [err] = captureExceptionMock.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toContain("[object Object]");
    expect(err.message).toContain("code");
    expect(err.message).toContain("42");
  });

  it("renders a key-less object (Event/SyntheticEvent) via its constructor name, not [object …]", () => {
    // An <img> onError / a DOM Event exposes its fields as prototype getters,
    // so it has no own enumerable keys → JSON.stringify yields "{}". This class
    // instance reproduces that shape deterministically (jsdom, unlike real
    // browsers, adds an own `isTrusted` key to DOM Events).
    class SyntheticErrorEvent {
      get type() {
        return "error";
      }
    }
    captureUnknownError("test.ctx", new SyntheticErrorEvent());

    const [err] = captureExceptionMock.mock.calls[0]!;
    expect(err.message).not.toContain("[object");
    expect(err.message).toContain("SyntheticErrorEvent");
  });

  it("renders a real DOM Event legibly (never [object Event])", () => {
    captureUnknownError("test.ctx", new Event("error"));

    const [err] = captureExceptionMock.mock.calls[0]!;
    expect(err.message).not.toContain("[object");
  });

  it("handles circular references without throwing", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    expect(() => captureUnknownError("test.ctx", circular)).not.toThrow();
    const [err] = captureExceptionMock.mock.calls[0]!;
    expect(err.message).not.toContain("[object Object]");
    expect(err.message).toContain("a"); // constructor-name fallback lists keys
  });

  it("logs via console.warn, never console.error (avoids captureConsole double-capture)", () => {
    captureUnknownError("test.ctx", "x");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("prints the context tag exactly once for a non-Error value (no double-tag)", () => {
    captureUnknownError("auth.signIn.credentials", { reason: "bad" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]![0]);
    const occurrences = message.split("[auth.signIn.credentials]").length - 1;
    expect(occurrences).toBe(1);
  });

  it("prints the context once plus the original message for a real Error", () => {
    captureUnknownError("auth.signIn.credentials", new Error("kaboom"));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]![0]);
    const occurrences = message.split("[auth.signIn.credentials]").length - 1;
    expect(occurrences).toBe(1);
    expect(message).toContain("kaboom");
  });

  it("captures exactly once per call", () => {
    captureUnknownError("test.ctx", new Error("once"));
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });
});
