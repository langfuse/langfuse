import { describe, expect, it } from "vitest";

import { listGatewayDecisionModelConnections } from "@/src/features/ai-gateway/fns/listGatewayDecisionModelConnections";

describe("listGatewayDecisionModelConnections", () => {
  it("filters to OpenAI and Vercel connections and keeps only decision-capable allowed models", () => {
    const connections = listGatewayDecisionModelConnections(
      [
        {
          id: "conn-openai",
          name: "Production OpenAI",
          provider: "OPENAI",
          allowedModels: ["gpt-4o", "gpt-6-luna", "text-embedding-3-small"],
        },
        {
          id: "conn-vercel",
          name: "Vercel AI Gateway",
          provider: "VERCEL",
          allowedModels: null,
        },
        {
          id: "conn-anthropic",
          name: "Anthropic",
          provider: "ANTHROPIC",
          allowedModels: null,
        },
        {
          id: "conn-openai-denied",
          name: "Restricted OpenAI",
          provider: "OPENAI",
          allowedModels: null,
        },
      ],
      [
        {
          connectionId: "conn-openai",
          success: true,
          models: [
            "gpt-4o",
            "gpt-6-luna",
            "text-embedding-3-small",
            "gpt-5-blocked",
          ],
          modelApiFormats: {
            "text-embedding-3-small": ["openai.embeddings"],
          },
        },
        {
          connectionId: "conn-vercel",
          success: true,
          models: [
            "anthropic/claude-sonnet-5",
            "typesafe-ai/jev",
            "openai/gpt-6-luna-decisions",
          ],
          modelApiFormats: {
            "anthropic/claude-sonnet-5": [
              "openai.responses",
              "openai.chat-completions",
              "anthropic.messages",
            ],
            "typesafe-ai/jev": ["openai.decisions"],
            "openai/gpt-6-luna-decisions": ["openai.decisions"],
          },
        },
        {
          connectionId: "conn-openai-denied",
          success: true,
          models: [],
          modelListingDenied: true,
        },
      ],
    );

    expect(connections).toEqual([
      {
        id: "conn-openai",
        name: "Production OpenAI",
        provider: "OPENAI",
        // Known OpenAI decision models sort ahead of general OpenAI models; embeddings and disallowed models are excluded.
        models: ["gpt-6-luna", "gpt-4o"],
        isCatalogUnknown: false,
      },
      {
        id: "conn-vercel",
        name: "Vercel AI Gateway",
        provider: "VERCEL",
        models: ["typesafe-ai/jev", "openai/gpt-6-luna-decisions"],
        isCatalogUnknown: false,
      },
      {
        id: "conn-openai-denied",
        name: "Restricted OpenAI",
        provider: "OPENAI",
        models: [],
        isCatalogUnknown: true,
      },
    ]);
  });
});
