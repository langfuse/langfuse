import { describe, expect, it } from "vitest";

import { describeGatewayModelAccess } from "@/src/features/ai-gateway/fns/describeGatewayModelAccess";

describe("describeGatewayModelAccess", () => {
  it("tells admins that an open credential enables models the provider adds later", () => {
    const access = describeGatewayModelAccess(null);

    expect(access.impact).toContain("adds later are enabled");
  });

  it("tells admins that a restricted credential leaves later models disabled", () => {
    const access = describeGatewayModelAccess(["gpt-4o"]);

    expect(access.impact).toContain("stay disabled");
  });
});
