import { reportError } from "@/src/utils/reportError";

const { captureExceptionMock, addBreadcrumbMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  addBreadcrumbMock: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
  addBreadcrumb: addBreadcrumbMock,
}));

describe("reportError", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureExceptionMock.mockClear();
    addBreadcrumbMock.mockClear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe("expected: true", () => {
    it("adds a breadcrumb and does NOT capture", () => {
      reportError(new Error("member of another project"), {
        area: "trpc.query",
        expected: true,
        extra: { code: "FORBIDDEN" },
      });

      expect(captureExceptionMock).not.toHaveBeenCalled();
      expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
      const crumb = addBreadcrumbMock.mock.calls[0]![0];
      expect(crumb.category).toBe("trpc.query");
      expect(crumb.type).toBe("error");
      expect(crumb.level).toBe("info");
      expect(crumb.data).toEqual({ code: "FORBIDDEN" });
    });

    it("does not warn or error for an expected state", () => {
      reportError("some expected state", {
        area: "auth.session",
        expected: true,
      });

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("unexpected (captured)", () => {
    it("passes a real Error through untouched (same instance → stack preserved) with area tag", () => {
      const original = new Error("boom");
      reportError(original, { area: "io.parse", extra: { traceId: "abc" } });

      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      const [err, options] = captureExceptionMock.mock.calls[0]!;
      expect(err).toBe(original); // same instance → original stack preserved
      expect(options.tags.area).toBe("io.parse");
      expect(options.extra).toEqual({ traceId: "abc" });
      expect(addBreadcrumbMock).not.toHaveBeenCalled();
    });

    it("synthesizes a legible Error for a plain object (not [object Object])", () => {
      reportError({ code: 42, reason: "bad" }, { area: "io.parse" });

      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      const [err] = captureExceptionMock.mock.calls[0]!;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).not.toContain("[object Object]");
      expect(err.message).toContain("code");
      expect(err.message).toContain("42");
      expect(err.message).toContain("io.parse");
    });

    it("synthesizes a legible Error for a string", () => {
      reportError("something failed", { area: "io.parse" });

      const [err] = captureExceptionMock.mock.calls[0]!;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("[io.parse] something failed");
    });

    it("logs via console.warn, never console.error (avoids captureConsole double-capture)", () => {
      reportError(new Error("boom"), { area: "io.parse" });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("captures exactly once per call", () => {
      reportError(new Error("once"), { area: "io.parse" });
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    });

    it("passes undefined extra through when omitted", () => {
      reportError(new Error("boom"), { area: "io.parse" });

      const [, options] = captureExceptionMock.mock.calls[0]!;
      expect(options.tags.area).toBe("io.parse");
      expect(options.extra).toBeUndefined();
    });
  });
});
