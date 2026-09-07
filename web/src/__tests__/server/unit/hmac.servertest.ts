import { describe, expect, it } from "vitest";

import { signHmacSha256, verifyHmacSha256 } from "@/src/server/utils/hmac";

describe("HMAC-SHA256 utilities", () => {
  it("signs messages as unpadded base64url", () => {
    expect(signHmacSha256("message", "secret")).toBe(
      "iKqz7ejTrflNJquQ07r9GxVBW9KQA9qgnfONygNw9mM",
    );
  });

  it("verifies signatures against current and previous secrets", () => {
    const signature = signHmacSha256("message", "previous-secret");

    expect(
      verifyHmacSha256({
        message: "message",
        signature,
        secrets: ["current-secret", "previous-secret"],
      }),
    ).toBe(true);
  });

  it("rejects changed messages and malformed signatures", () => {
    const signature = signHmacSha256("message", "secret");

    expect(
      verifyHmacSha256({
        message: "changed-message",
        signature,
        secrets: ["secret"],
      }),
    ).toBe(false);
    expect(
      verifyHmacSha256({
        message: "message",
        signature: `${signature}=`,
        secrets: ["secret"],
      }),
    ).toBe(false);
  });
});
