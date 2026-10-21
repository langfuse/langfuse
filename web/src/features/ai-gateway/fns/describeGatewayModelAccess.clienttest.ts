import { describe, expect, it } from "vitest";

import { describeGatewayModelAccess } from "@/src/features/ai-gateway/fns/describeGatewayModelAccess";

describe("describeGatewayModelAccess", () => {
  it("tells admins that an open credential includes models the provider publishes later", () => {
    const access = describeGatewayModelAccess(null, "OPENAI");

    expect(access).toContain("including models OpenAI publishes in the future");
  });

  it("tells admins that a restricted credential leaves later models off", () => {
    const access = describeGatewayModelAccess(["gpt-4o"], "OPENAI");

    expect(access).toContain("stay off until you enable them");
  });
});
