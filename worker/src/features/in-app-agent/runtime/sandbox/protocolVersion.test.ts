import { describe, expect, it } from "vitest";

import {
  IN_APP_AGENT_SANDBOX_RUNTIME_PROTOCOL_VERSION,
  assertSandboxRuntimeProtocolVersion,
  reportedSandboxRuntimeProtocolVersion,
} from "./protocolVersion";

describe("sandbox runtime protocol version", () => {
  it("accepts a matching /health body and rejects a stale or missing version", () => {
    expect(
      reportedSandboxRuntimeProtocolVersion({
        status: "ok",
        protocolVersion: IN_APP_AGENT_SANDBOX_RUNTIME_PROTOCOL_VERSION,
      }),
    ).toBe(1);

    expect(reportedSandboxRuntimeProtocolVersion({ status: "ok" })).toBe(0);

    expect(() =>
      assertSandboxRuntimeProtocolVersion({
        status: "ok",
        protocolVersion: IN_APP_AGENT_SANDBOX_RUNTIME_PROTOCOL_VERSION,
      }),
    ).not.toThrow();

    expect(() => assertSandboxRuntimeProtocolVersion({ status: "ok" })).toThrow(
      /Rebuild the MicroVM image/,
    );
  });
});
