import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@langfuse/shared/src/server";

import {
  nextAuthLogger,
  serializeNextAuthMetadata,
} from "@/src/server/utils/nextAuthLogger";

describe("nextAuthLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs an error as a single structured entry with code and error fields", () => {
    const errorSpy = vi.spyOn(logger, "error");

    const error = new Error("Invalid email address format.");
    nextAuthLogger.error?.("SIGNIN_EMAIL_ERROR", error);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, meta] = errorSpy.mock.calls[0] as unknown as [
      string,
      Record<string, any>,
    ];
    expect(message).toBe("[NEXT_AUTH] SIGNIN_EMAIL_ERROR");
    expect(meta.nextAuthErrorCode).toBe("SIGNIN_EMAIL_ERROR");
    expect(meta.error.message).toBe("Invalid email address format.");
    expect(meta.error.name).toBe("Error");
    expect(typeof meta.error.stack).toBe("string");
  });

  it("serializes metadata objects containing an error plus extra keys", () => {
    const errorSpy = vi.spyOn(logger, "error");

    nextAuthLogger.error?.("SIGNIN_EMAIL_ERROR", {
      error: new Error("Invalid email address format."),
      providerId: "email",
      message: "Invalid email address format.",
    });

    const [, meta] = errorSpy.mock.calls[0] as unknown as [
      string,
      Record<string, any>,
    ];
    expect(meta.providerId).toBe("email");
    expect(meta.error.message).toBe("Invalid email address format.");
  });

  it("truncates oversized caller-controlled fields", () => {
    const oversized = "x".repeat(50_000);
    const error = new Error(oversized);
    // Node system errors (e.g. ERR_INVALID_URL) carry own enumerable props
    // such as `input`, which contain raw caller-controlled payloads.
    (error as any).input = oversized;

    const meta = serializeNextAuthMetadata(error) as Record<string, any>;

    expect(meta.error.message.length).toBeLessThan(3_000);
    expect(meta.error.message).toContain("…[truncated]");
    expect(meta.error.input.length).toBeLessThan(3_000);
    expect(meta.error.input).toContain("…[truncated]");
  });

  it("logs warnings with the warning code", () => {
    const warnSpy = vi.spyOn(logger, "warn");

    nextAuthLogger.warn?.("NEXTAUTH_URL");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, meta] = warnSpy.mock.calls[0] as unknown as [
      string,
      Record<string, any>,
    ];
    expect(message).toBe("[NEXT_AUTH] NEXTAUTH_URL");
    expect(meta.nextAuthWarningCode).toBe("NEXTAUTH_URL");
  });

  it("handles primitive and undefined metadata without throwing", () => {
    const debugSpy = vi.spyOn(logger, "debug");

    nextAuthLogger.debug?.("SESSION_TOKEN", undefined);
    nextAuthLogger.debug?.("SESSION_TOKEN", "plain-string");

    expect(debugSpy).toHaveBeenCalledTimes(2);
    const [, firstMeta] = debugSpy.mock.calls[0] as unknown as [
      string,
      Record<string, any>,
    ];
    const [, secondMeta] = debugSpy.mock.calls[1] as unknown as [
      string,
      Record<string, any>,
    ];
    expect(firstMeta).toEqual({ nextAuthDebugCode: "SESSION_TOKEN" });
    expect(secondMeta.metadata).toBe("plain-string");
  });
});
