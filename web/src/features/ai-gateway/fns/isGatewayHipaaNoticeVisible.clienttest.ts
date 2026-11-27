// @vitest-environment node

import { describe, expect, it } from "vitest";

import { isGatewayHipaaNoticeVisible } from "@/src/features/ai-gateway/fns/isGatewayHipaaNoticeVisible";

describe("isGatewayHipaaNoticeVisible", () => {
  it("shows the notice in the HIPAA cloud region", () => {
    expect(isGatewayHipaaNoticeVisible("HIPAA")).toBe(true);
  });

  it.each(["EU", "US", "JP", "STAGING", "DEV"] as const)(
    "hides the notice in the %s cloud region",
    (region) => {
      expect(isGatewayHipaaNoticeVisible(region)).toBe(false);
    },
  );

  it("hides the notice on self-hosted deployments", () => {
    expect(isGatewayHipaaNoticeVisible(undefined)).toBe(false);
  });
});
