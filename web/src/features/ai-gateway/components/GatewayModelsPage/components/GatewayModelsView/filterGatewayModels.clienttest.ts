// @vitest-environment node

import { describe, expect, it } from "vitest";
import { GATEWAY_MODELS_FIELD_REGISTRY } from "@/src/features/ai-gateway/constants/modelsSearchRegistry";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { runSearchBarInvariants } from "@/src/features/search-bar/lib/searchBarInvariants";
import {
  filterGatewayModels,
  type GatewayModelRow,
} from "./filterGatewayModels";

const models: GatewayModelRow[] = [
  {
    id: "model-small",
    availableVia: [
      {
        connectionId: "connection-primary",
        connectionName: "Primary",
        provider: "OPENAI",
      },
    ],
    apiFormats: ["OpenAI Responses", "OpenAI Chat Completions"],
  },
  {
    id: "model-large",
    availableVia: [
      {
        connectionId: "connection-secondary",
        connectionName: "Secondary",
        provider: "ANTHROPIC",
      },
    ],
    apiFormats: ["Anthropic Messages"],
  },
];

function search(query: string) {
  const result = planCommit(query, undefined, GATEWAY_MODELS_FIELD_REGISTRY);
  if (result.status !== "committed") {
    throw new Error(`Query did not commit: ${query}`);
  }
  return filterGatewayModels(
    models,
    result.searchQuery ?? "",
    result.filters,
  ).map((model) => model.id);
}

describe("gateway model grammar", () => {
  it("keeps model-name substring search separate from provider filters", () => {
    expect(search("SMALL provider:OPENAI")).toEqual(["model-small"]);
    expect(search("Primary provider:OPENAI")).toEqual([]);
  });

  it("preserves API-format any-of, all-of and none-of semantics", () => {
    expect(
      search('apiFormat:("Anthropic Messages" OR "OpenAI Responses")'),
    ).toEqual(["model-small", "model-large"]);
    expect(
      search('apiFormat:("OpenAI Responses" AND "OpenAI Chat Completions")'),
    ).toEqual(["model-small"]);
    expect(search('-apiFormat:"OpenAI Responses"')).toEqual(["model-large"]);
  });

  it("preserves existing case-insensitive custom sidebar filters", () => {
    expect(
      filterGatewayModels(models, "", [
        {
          column: "apiFormat",
          type: "string",
          operator: "contains",
          value: "responses",
        },
      ]).map((model) => model.id),
    ).toEqual(["model-small"]);
  });

  it("rejects fields and operators the model catalog cannot apply", () => {
    for (const query of [
      "latency:>1",
      "metadata.region:eu",
      "provider:>OPENAI",
      "has:provider",
      "-has:provider",
    ]) {
      expect(
        planCommit(query, undefined, GATEWAY_MODELS_FIELD_REGISTRY).status,
        query,
      ).not.toBe("committed");
    }
  });

  it("keeps validation and lowering aligned with the sidebar registry", () => {
    expect(
      runSearchBarInvariants({
        name: "gateway model catalog",
        registry: GATEWAY_MODELS_FIELD_REGISTRY,
        fieldValues: ["OPENAI", "ANTHROPIC", "OpenAI Responses"],
        freeTextValues: ["model small"],
        extraKeys: ["metadata.region", "scores.quality"],
        scoreContexts: [],
      }),
    ).toEqual([]);
  });
});
