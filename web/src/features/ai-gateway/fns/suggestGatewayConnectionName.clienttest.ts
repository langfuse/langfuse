import { describe, expect, it } from "vitest";
import { suggestGatewayConnectionName } from "./suggestGatewayConnectionName";

describe("suggestGatewayConnectionName", () => {
  it("uses the lowercased provider label when no connection has taken it", () => {
    expect(suggestGatewayConnectionName("OPENAI", ["anthropic"])).toBe(
      "openai",
    );
  });

  it("appends the first free numeric suffix, ignoring case", () => {
    expect(
      suggestGatewayConnectionName("OPENAI", [
        "OpenAI",
        "openai-1",
        "OpenAI-3",
      ]),
    ).toBe("openai-2");
  });
});
