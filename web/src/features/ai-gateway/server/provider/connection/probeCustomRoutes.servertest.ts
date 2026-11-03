import { describe, expect, it, vi } from "vitest";

import { parseOrigin, probeCustomRoutes } from "./probeCustomRoutes";

/** A fetcher keyed by "METHOD path" → status. Routes absent from the map
 * return 404; anything mapped returns that status. */
const fetcherWith = (statuses: Record<string, number>) => {
  return (async (url: URL | string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    const status = statuses[`${method} ${path}`] ?? 404;
    return new Response(status === 200 ? '{"data":[]}' : "{}", { status });
  }) as typeof fetch;
};

describe("parseOrigin", () => {
  it("keeps the path prefix and drops trailing slashes", () => {
    expect(parseOrigin("http://ai02:8000/v1/")).toBe("http://ai02:8000/v1");
  });

  it("rejects URLs with query strings, credentials, or non-http schemes", () => {
    expect(parseOrigin("http://ai02:8000/v1?key=1")).toBeNull();
    expect(parseOrigin("http://user:pw@ai02:8000/v1")).toBeNull();
    expect(parseOrigin("ftp://ai02:8000/v1")).toBeNull();
    expect(parseOrigin("not a url")).toBeNull();
  });
});

describe("probeCustomRoutes", () => {
  it("marks routes present when the upstream answers anything but 404/405", async () => {
    const result = await probeCustomRoutes({
      baseUrl: "http://ai02:8000/v1",
      credential: null,
      fetcher: fetcherWith({
        "GET /v1/models": 200,
        "POST /v1/chat/completions": 400,
        "POST /v1/responses": 404,
        "POST /v1/messages": 405,
      }),
    });
    expect(result).toEqual({
      success: true,
      routes: ["openai.chat-completions"],
    });
  });

  it("treats an application-level 404 with an error object as a served route", async () => {
    const fetcher = (async (url: URL | string) => {
      const path = new URL(url).pathname;
      if (path === "/v1/models") {
        return new Response('{"data":[]}', { status: 200 });
      }
      // vLLM answers an unknown model on the served completions route with a
      // structured error, but a missing route with the framework body.
      const body =
        path === "/v1/chat/completions"
          ? '{"error":{"message":"The model `probe` does not exist.","code":404}}'
          : '{"detail":"Not Found"}';
      return new Response(body, { status: 404 });
    }) as typeof fetch;
    const result = await probeCustomRoutes({
      baseUrl: "http://ai02:8000/v1",
      credential: null,
      fetcher,
    });
    expect(result).toEqual({
      success: true,
      routes: ["openai.chat-completions"],
    });
  });

  it("reports unreachable when /models fails", async () => {
    const result = await probeCustomRoutes({
      baseUrl: "http://ai02:8000/v1",
      credential: null,
      fetcher: fetcherWith({ "GET /v1/models": 503 }),
    });
    expect(result).toEqual({ success: false, error: "unreachable" });
  });

  it("reports unauthorized when /models rejects the credential", async () => {
    const result = await probeCustomRoutes({
      baseUrl: "http://ai02:8000/v1",
      credential: "sk-wrong",
      fetcher: fetcherWith({ "GET /v1/models": 401 }),
    });
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("rejects an invalid base URL before any request", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const result = await probeCustomRoutes({
      baseUrl: "http://user@host/v1",
      credential: null,
      fetcher,
    });
    expect(result).toEqual({ success: false, error: "invalid_base_url" });
  });
});
