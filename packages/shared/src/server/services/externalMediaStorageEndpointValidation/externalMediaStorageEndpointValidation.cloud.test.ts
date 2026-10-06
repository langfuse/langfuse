import { describe, expect, it, vi } from "vitest";

import { validateExternalMediaStorageEndpoint } from "./externalMediaStorageEndpointValidation";

vi.mock("../../../env", () => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
  },
}));

describe("validateExternalMediaStorageEndpoint on Langfuse Cloud", () => {
  it("requires HTTPS even when an HTTP endpoint is otherwise allowlisted", async () => {
    await expect(
      validateExternalMediaStorageEndpoint("http://storage.example.com", {
        hosts: ["storage.example.com"],
        ips: [],
        ip_ranges: [],
      }),
    ).rejects.toMatchObject({
      code: "https-required",
    });
  });
});
