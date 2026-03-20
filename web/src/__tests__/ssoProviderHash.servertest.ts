/** @jest-environment node */
import { generateSsoCallbackUrlId } from "@langfuse/shared/src/server";

describe("generateSsoCallbackUrlId", () => {
  it("generates an 12-character hex string", () => {
    const result = generateSsoCallbackUrlId({
      domain: "example.com",
      authProvider: "okta",
    });

    expect(result).toHaveLength(12);
    expect(result).toMatch(/^[a-f0-9]{12}$/);
  });

  it("is deterministic - same inputs produce same output", () => {
    const params = {
      domain: "example.com",
      authProvider: "okta",
    };

    const result1 = generateSsoCallbackUrlId(params);
    const result2 = generateSsoCallbackUrlId(params);

    expect(result1).toBe(result2);
  });

  it("produces different hashes for different domains", () => {
    const result1 = generateSsoCallbackUrlId({
      domain: "company-a.com",
      authProvider: "okta",
    });

    const result2 = generateSsoCallbackUrlId({
      domain: "company-b.com",
      authProvider: "okta",
    });

    expect(result1).not.toBe(result2);
  });
});
