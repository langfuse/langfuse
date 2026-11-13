import { describe, expect, it } from "vitest";

import { getGatewayModelCounts } from "./getGatewayModelCounts";

describe("getGatewayModelCounts", () => {
  it("leaves the total unknown when only the allowlist could be read", () => {
    expect(
      getGatewayModelCounts(
        [
          {
            connectionId: "allowlist",
            success: true,
            models: ["a", "b"],
            catalogUnavailable: true,
          },
          {
            connectionId: "all",
            success: true,
            models: [],
            catalogUnavailable: true,
          },
        ] as Parameters<typeof getGatewayModelCounts>[0],
        [
          { id: "allowlist", allowedModels: ["a", "b"] },
          { id: "all", allowedModels: null },
        ],
      ),
    ).toEqual({ allowlist: { enabled: 2 }, all: { enabled: "all" } });
  });
});
