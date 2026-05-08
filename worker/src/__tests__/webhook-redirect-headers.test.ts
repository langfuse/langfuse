import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../../packages/shared/src/server/logger";
import {
  fetchWithSecureRedirects,
  type OutboundUrlValidationWhitelist,
} from "../../../packages/shared/src/server/outbound-url";

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

describe("fetchWithSecureRedirects header handling", () => {
  it("should reject DNS resolutions to blocked addresses at connection time", async () => {
    vi.unstubAllGlobals();

    try {
      await fetchWithSecureRedirects(
        "http://localhost",
        { method: "GET", signal: AbortSignal.timeout(1_000) },
        {
          maxRedirects: 0,
          redirectValidation: {
            validateUrl: vi.fn().mockResolvedValue(undefined),
            whitelist: {
              hosts: [],
              ips: [],
              ip_ranges: [],
            },
          },
        },
      );

      throw new Error("Expected fetch to fail");
    } catch (error) {
      expect(collectErrorMessages(error)).toContain(
        "Blocked IP address detected",
      );
    } finally {
      vi.stubGlobal("fetch", fetchMock);
    }
  });

  it("should attach a connection-validating dispatcher when validation is enabled", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await fetchWithSecureRedirects(
      "https://example.com/start",
      { method: "POST" },
      {
        maxRedirects: 0,
        redirectValidation: {
          validateUrl: vi.fn().mockResolvedValue(undefined),
          whitelist: {
            hosts: ["example.com"],
            ips: [],
            ip_ranges: [],
          },
        },
      },
    );

    const requestOptions = fetchMock.mock.calls[0]?.[1] as
      | (RequestInit & { dispatcher?: unknown })
      | undefined;

    expect(requestOptions?.dispatcher).toBeDefined();
  });

  it("should not attach a connection-validating dispatcher when validation is skipped", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await fetchWithSecureRedirects(
      "https://example.com/start",
      { method: "POST" },
      {
        maxRedirects: 0,
        skipValidation: true,
      },
    );

    const requestOptions = fetchMock.mock.calls[0]?.[1] as
      | (RequestInit & { dispatcher?: unknown })
      | undefined;

    expect(requestOptions?.dispatcher).toBeUndefined();
  });

  it("should close evicted connection-validating dispatchers", async () => {
    const closeSpy = vi.fn();

    for (let i = 0; i < 32; i++) {
      fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));

      await fetchWithSecureRedirects(
        "https://example.com/start",
        { method: "POST" },
        {
          maxRedirects: 0,
          redirectValidation: {
            validateUrl: vi.fn().mockResolvedValue(undefined),
            whitelist: {
              hosts: [`example-${i}.com`],
              ips: [],
              ip_ranges: [],
            },
          },
        },
      );

      if (i === 0) {
        const requestOptions = fetchMock.mock.calls[0]?.[1] as
          | (RequestInit & {
              dispatcher?: { close: () => Promise<void> | void };
            })
          | undefined;

        if (!requestOptions?.dispatcher) {
          throw new Error("Expected dispatcher to be attached");
        }

        vi.spyOn(requestOptions.dispatcher, "close").mockImplementation(
          closeSpy,
        );
      }
    }

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("should keep sensitive headers on same-origin redirects", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://example.com/final" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await fetchWithSecureRedirects(
      "https://example.com/start",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          Cookie: "session=secret",
          "Proxy-Authorization": "Basic proxy-secret",
          "x-langfuse-signature": "t=1,v1=secret",
          "X-API-Key": "custom-secret",
          "x-custom-header": "keep-me",
        },
      },
      {
        maxRedirects: 1,
        skipValidation: true,
        additionalSensitiveHeaders: ["X-API-Key"],
      },
    );

    const finalRequest = fetchMock.mock.calls[1];
    const finalHeaders = new Headers(finalRequest?.[1]?.headers);

    expect(finalHeaders.get("authorization")).toBe("Bearer token");
    expect(finalHeaders.get("cookie")).toBe("session=secret");
    expect(finalHeaders.get("proxy-authorization")).toBe("Basic proxy-secret");
    expect(finalHeaders.get("x-langfuse-signature")).toBe("t=1,v1=secret");
    expect(finalHeaders.get("x-api-key")).toBe("custom-secret");
    expect(finalHeaders.get("x-custom-header")).toBe("keep-me");
  });

  it("should strip sensitive headers on cross-origin redirects", async () => {
    const warnSpy = vi
      .spyOn(logger, "warn")
      .mockImplementation(() => undefined);

    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://other.example.com/final" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await fetchWithSecureRedirects(
      "https://example.com/start",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          Cookie: "session=secret",
          "Proxy-Authorization": "Basic proxy-secret",
          "x-langfuse-signature": "t=1,v1=secret",
          "X-API-Key": "custom-secret",
          "x-custom-header": "keep-me",
        },
      },
      {
        maxRedirects: 1,
        skipValidation: true,
        additionalSensitiveHeaders: ["X-API-Key"],
      },
    );

    const finalRequest = fetchMock.mock.calls[1];
    const finalHeaders = new Headers(finalRequest?.[1]?.headers);

    expect(finalHeaders.get("authorization")).toBeNull();
    expect(finalHeaders.get("cookie")).toBeNull();
    expect(finalHeaders.get("proxy-authorization")).toBeNull();
    expect(finalHeaders.get("x-langfuse-signature")).toBeNull();
    expect(finalHeaders.get("x-api-key")).toBeNull();
    expect(finalHeaders.get("x-custom-header")).toBe("keep-me");
    expect(warnSpy).toHaveBeenCalledWith(
      "Stripping sensitive headers for cross-origin redirect",
      {
        from: "https://example.com",
        to: "https://other.example.com",
        redirectDepth: 0,
        strippedHeaderNames: [
          "authorization",
          "cookie",
          "proxy-authorization",
          "x-api-key",
          "x-langfuse-signature",
        ],
      },
    );
  });

  it("should not warn on cross-origin redirects without sensitive headers", async () => {
    const warnSpy = vi
      .spyOn(logger, "warn")
      .mockImplementation(() => undefined);

    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://other.example.com/final" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await fetchWithSecureRedirects(
      "https://example.com/start",
      {
        method: "POST",
        headers: {
          "x-custom-header": "keep-me",
        },
      },
      { maxRedirects: 1, skipValidation: true },
    );

    const finalRequest = fetchMock.mock.calls[1];
    const finalHeaders = new Headers(finalRequest?.[1]?.headers);

    expect(finalHeaders.get("x-custom-header")).toBe("keep-me");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should use custom redirect validation when provided", async () => {
    const validateRedirectUrl =
      vi.fn<
        (
          url: string,
          whitelist?: OutboundUrlValidationWhitelist,
        ) => Promise<void>
      >();
    validateRedirectUrl.mockResolvedValue(undefined);
    const whitelist = {
      hosts: ["other.example.com"],
      ips: [],
      ip_ranges: [],
    };

    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://other.example.com/final" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await fetchWithSecureRedirects(
      "https://example.com/start",
      { method: "POST" },
      {
        maxRedirects: 1,
        redirectValidation: {
          validateUrl: validateRedirectUrl,
          whitelist,
        },
      },
    );

    expect(validateRedirectUrl).toHaveBeenCalledWith(
      "https://other.example.com/final",
      whitelist,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function collectErrorMessages(error: unknown): string[] {
  const messages: string[] = [];

  const collect = (value: unknown) => {
    if (value instanceof Error) {
      messages.push(value.message);

      if (value instanceof AggregateError) {
        for (const nestedError of value.errors) {
          collect(nestedError);
        }
      }

      collect(value.cause);
      return;
    }

    if (typeof value === "string") {
      messages.push(value);
    }
  };

  collect(error);
  return messages;
}
