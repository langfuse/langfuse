// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  filterGatewayModels,
  type GatewayModelRow,
} from "./filterGatewayModels";

const models: GatewayModelRow[] = [
  {
    id: "Primary:model-small",
    connectionId: "connection-primary",
    connectionName: "Primary",
    provider: "OPENAI",
    apiFormats: ["OpenAI Responses", "OpenAI Chat Completions"],
  },
  {
    id: "Secondary:model-large",
    connectionId: "connection-secondary",
    connectionName: "Secondary",
    provider: "ANTHROPIC",
    apiFormats: ["Anthropic Messages"],
  },
];

describe("filterGatewayModels", () => {
  it("searches model names case-insensitively", () => {
    expect(
      filterGatewayModels(models, "SMALL", "all").map((model) => model.id),
    ).toEqual(["Primary:model-small"]);
  });

  it("filters models by provider", () => {
    expect(
      filterGatewayModels(models, "", "ANTHROPIC").map((model) => model.id),
    ).toEqual(["Secondary:model-large"]);
  });
});
