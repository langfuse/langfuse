// @vitest-environment node

import { describe, expect, it } from "vitest";

import { getGatewayModelApiFormats } from "@/src/features/ai-gateway/fns/getGatewayModelApiFormats";

describe("getGatewayModelApiFormats", () => {
  it("leaves formats empty for an unreported model on an OpenAI connection with a custom base URL", () => {
    expect(
      getGatewayModelApiFormats(
        "OPENAI",
        "bge-m3",
        undefined,
        "https://custom.api.openai.com/v1",
      ),
    ).toEqual([]);
  });

  it("uses the formats the catalog reports on a custom base URL", () => {
    expect(
      getGatewayModelApiFormats(
        "OPENAI",
        "text-embedding-3-small",
        ["openai.embeddings"],
        "https://custom.api.openai.com/v1",
      ),
    ).toEqual(["OpenAI Embeddings"]);
  });

  it.each([
    undefined,
    null,
    "",
    "  ",
    "https://api.openai.com/v1",
    "https://api.openai.com/v1/",
    "https://us.api.openai.com/v1",
    "https://eu.api.openai.com/v1",
  ])("keeps the OpenAI defaults for base URL %j", (baseURL) => {
    expect(
      getGatewayModelApiFormats("OPENAI", "gpt-5", undefined, baseURL),
    ).toEqual(["OpenAI Responses", "OpenAI Chat Completions"]);
  });

  it("keeps other providers' defaults when they have a custom base URL", () => {
    expect(
      getGatewayModelApiFormats(
        "OPENROUTER",
        "x/y",
        undefined,
        "https://eu.openrouter.ai/api/v1",
      ),
    ).toEqual([
      "OpenAI Responses",
      "OpenAI Chat Completions",
      "Anthropic Messages",
    ]);
  });
});
