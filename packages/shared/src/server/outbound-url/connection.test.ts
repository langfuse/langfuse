import { describe, expect, it, vi } from "vitest";

const { agentOptions } = vi.hoisted(() => ({
  agentOptions: [] as unknown[],
}));

vi.mock("undici", async () => {
  const actual = await vi.importActual<typeof import("undici")>("undici");

  class RecordingAgent extends actual.Agent {
    constructor(options?: ConstructorParameters<typeof actual.Agent>[0]) {
      super(options);
      agentOptions.push(options);
    }
  }

  return {
    ...actual,
    Agent: RecordingAgent,
  };
});

import { addSecureOutboundConnectionValidation } from "./connection";

describe("secure outbound dispatcher", () => {
  it("waits one second for each address-family connection attempt", () => {
    addSecureOutboundConnectionValidation({}, {});

    expect(agentOptions).toHaveLength(1);
    const options = agentOptions[0] as {
      connect: {
        autoSelectFamily: boolean;
        autoSelectFamilyAttemptTimeout: number;
        lookup: unknown;
      };
    };
    expect(options.connect.autoSelectFamily).toBe(true);
    expect(options.connect.autoSelectFamilyAttemptTimeout).toBe(1_000);
    expect(typeof options.connect.lookup).toBe("function");
  });
});
