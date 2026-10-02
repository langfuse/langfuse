import { describe, it, expect } from "vitest";

import { AvailableWebhookApiSchema } from "./automations";

describe("AvailableWebhookApiSchema", () => {
  it("accepts monitor: v1", () => {
    expect(AvailableWebhookApiSchema.safeParse({ monitor: "v1" }).success).toBe(
      true,
    );
  });

  it("accepts prompt and monitor together", () => {
    expect(
      AvailableWebhookApiSchema.safeParse({ prompt: "v1", monitor: "v1" })
        .success,
    ).toBe(true);
  });

  it("accepts an empty record", () => {
    expect(AvailableWebhookApiSchema.safeParse({}).success).toBe(true);
  });

  it("rejects unknown api keys", () => {
    expect(AvailableWebhookApiSchema.safeParse({ bogus: "v1" }).success).toBe(
      false,
    );
  });

  it("rejects unknown api versions", () => {
    expect(AvailableWebhookApiSchema.safeParse({ monitor: "v2" }).success).toBe(
      false,
    );
  });
});
