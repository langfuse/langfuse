import { describe, expect, it } from "vitest";

import {
  digestExecutionToken,
  digestScript,
  executionPublicKey,
  parseExecutionPublicKey,
} from "./scriptExecution";
import { tokensEqual } from "./server/scriptExecution";

describe("script execution tokens", () => {
  it("stores only a digest of the opaque token", () => {
    const token = "opaque-token";
    const digest = digestExecutionToken(token);

    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(token);
    expect(tokensEqual(digest, digestExecutionToken(token))).toBe(true);
    expect(tokensEqual(digest, digestExecutionToken("other"))).toBe(false);
  });

  it("round-trips the public credential id", () => {
    expect(parseExecutionPublicKey(executionPublicKey("abc"))).toBe("abc");
    expect(parseExecutionPublicKey("pk-lf-not-an-execution")).toBeUndefined();
  });

  it("digests the exact approved script bytes", () => {
    expect(digestScript("print(1)")).toBe(digestScript("print(1)"));
    expect(digestScript("print(1)")).not.toBe(digestScript("print(2)"));
  });
});
