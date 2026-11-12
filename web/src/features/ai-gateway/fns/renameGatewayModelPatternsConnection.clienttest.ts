import { describe, expect, it } from "vitest";

import { renameGatewayModelPatternsConnection } from "@/src/features/ai-gateway/fns/renameGatewayModelPatternsConnection";

describe("renameGatewayModelPatternsConnection", () => {
  it("rewrites exact connection prefixes of includes and excludes only", () => {
    expect(
      renameGatewayModelPatternsConnection(
        ["openai:gpt-5*", "-openai:*preview*", "openai-eu:*", "open*:o3", "*"],
        "openai",
        "openai-us",
      ),
    ).toEqual([
      "openai-us:gpt-5*",
      "-openai-us:*preview*",
      "openai-eu:*",
      "open*:o3",
      "*",
    ]);
  });
});
