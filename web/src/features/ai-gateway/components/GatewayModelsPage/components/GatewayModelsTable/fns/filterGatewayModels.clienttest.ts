// @vitest-environment node

import { describe, expect, it } from "vitest";

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
        enabled: true,
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
        enabled: true,
      },
    ],
    apiFormats: ["Anthropic Messages"],
  },
];

describe("filterGatewayModels", () => {
  it("searches model names case-insensitively", () => {
    expect(
      filterGatewayModels(models, "SMALL", "all").map((model) => model.id),
    ).toEqual(["model-small"]);
  });

  it("filters models by provider", () => {
    expect(
      filterGatewayModels(models, "", "ANTHROPIC").map((model) => model.id),
    ).toEqual(["model-large"]);
  });
});
