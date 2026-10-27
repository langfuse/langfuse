import { describe, expect, it, vi } from "vitest";
import { listOpenAIConnectionModels } from "./listOpenAIConnectionModels";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("listOpenAIConnectionModels", () => {
  it("lists sorted, unique model ids from {baseURL}/models with the connection's credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        object: "list",
        data: [
          { id: "gpt-b" },
          { id: "gpt-a", owned_by: "org" },
          { id: "gpt-b" },
        ],
      }),
    );

    const result = await listOpenAIConnectionModels({
      secretKey: "sk-test",
      baseURL: "https://gateway.example.com/v1/",
      extraHeaders: { "x-tenant": "acme" },
      fetchImpl,
    });

    expect(result).toEqual({ success: true, models: ["gpt-a", "gpt-b"] });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gateway.example.com/v1/models");
    expect(init.headers).toEqual({
      "x-tenant": "acme",
      Authorization: "Bearer sk-test",
    });
  });

  it("defaults to the OpenAI API when the connection has no base URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));

    await listOpenAIConnectionModels({ secretKey: "sk-test", fetchImpl });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://api.openai.com/v1/models",
    );
  });

  it("reports a rejected API key", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "invalid key" }, 401));

    const result = await listOpenAIConnectionModels({
      secretKey: "sk-wrong",
      fetchImpl,
    });

    expect(result).toEqual({
      success: false,
      error: "The endpoint rejected the API key (HTTP 401).",
    });
  });

  it("reports a response that is not an OpenAI model list", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("<html></html>", { status: 200 }));

    const result = await listOpenAIConnectionModels({
      secretKey: "sk-test",
      fetchImpl,
    });

    expect(result.success).toBe(false);
  });

  it("does not call a base URL that contains {model}", async () => {
    const fetchImpl = vi.fn();

    const result = await listOpenAIConnectionModels({
      secretKey: "sk-test",
      baseURL: "https://gateway.example.com/{model}/v1",
      fetchImpl,
    });

    expect(result.success).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks private addresses through the secure LLM fetch", async () => {
    const result = await listOpenAIConnectionModels({
      secretKey: "sk-test",
      baseURL: "http://10.0.0.1/v1",
    });

    expect(result).toMatchObject({ success: false });
    expect(result.success === false && result.error).toMatch(/blocked/i);
  });
});
