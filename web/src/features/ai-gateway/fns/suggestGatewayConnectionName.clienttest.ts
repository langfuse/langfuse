import { describe, expect, it } from "vitest";
import { suggestGatewayConnectionName } from "./suggestGatewayConnectionName";

describe("suggestGatewayConnectionName", () => {
  it("uses the provider label when no connection has taken it", () => {
    expect(suggestGatewayConnectionName("OPENAI", ["Anthropic"])).toBe(
      "OpenAI",
    );
  });

  it("appends the first free numeric suffix, ignoring case", () => {
    expect(
      suggestGatewayConnectionName("OPENAI", [
        "openai",
        "OpenAI-1",
        "OpenAI-3",
      ]),
    ).toBe("OpenAI-2");
  });
});
