// @vitest-environment node

import { describe, expect, it } from "vitest";

import { filterGatewayModelsByApiFormat } from "@/src/features/ai-gateway/fns/filterGatewayModelsByApiFormat";
import { type ApiFormat } from "@/src/features/ai-gateway/fns/getGatewayModelApiFormats";

describe("filterGatewayModelsByApiFormat", () => {
  it("keeps every model when the models offer no choice of format", () => {
    const models: { id: string; apiFormats: ApiFormat[] }[] = [
      { id: "anthropic.claude-sonnet-5", apiFormats: ["Anthropic Messages"] },
      { id: "amazon.titan-embed", apiFormats: [] },
    ];

    expect(
      filterGatewayModelsByApiFormat(models, ["Anthropic Messages"]),
    ).toEqual({
      available: ["Anthropic Messages"],
      active: [],
      models,
    });
  });
});
