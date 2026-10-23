import { describe, expect, it } from "vitest";
import { GATEWAY_CONNECTION_NAME_ERRORS } from "@/src/features/ai-gateway/constants/gatewayConnection";
import { getLiveConnectionNameError } from "./getLiveConnectionNameError";

describe("getLiveConnectionNameError", () => {
  it("flags a name taken by another connection, ignoring case", () => {
    expect(
      getLiveConnectionNameError({
        name: "PRODUCTION",
        currentName: undefined,
        existingNames: ["production"],
      }),
    ).toBe(GATEWAY_CONNECTION_NAME_ERRORS.duplicate);
  });

  it("allows re-casing the connection's own name", () => {
    expect(
      getLiveConnectionNameError({
        name: "Production",
        currentName: "production",
        existingNames: ["production"],
      }),
    ).toBeNull();
  });

  it("leaves an unchanged legacy name alone", () => {
    expect(
      getLiveConnectionNameError({
        name: "OpenAI production",
        currentName: "OpenAI production",
        existingNames: ["OpenAI production"],
      }),
    ).toBeNull();
  });

  it("flags periods", () => {
    expect(
      getLiveConnectionNameError({
        name: "openai.v2",
        currentName: undefined,
        existingNames: [],
      }),
    ).toBe(GATEWAY_CONNECTION_NAME_ERRORS.invalidCharacters);
  });
});
