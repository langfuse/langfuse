import { beforeEach, describe, expect, it, vi } from "vitest";

const microvmSendMock = vi.fn();

vi.mock("@aws-sdk/client-lambda-microvms", () => {
  class LambdaMicrovmsClient {
    send = microvmSendMock;
  }

  class CreateMicrovmAuthTokenCommand {
    constructor(public readonly input: unknown) {}
  }

  class GetMicrovmCommand {
    constructor(public readonly input: unknown) {}
  }

  class ResumeMicrovmCommand {
    constructor(public readonly input: unknown) {}
  }

  class RunMicrovmCommand {
    constructor(public readonly input: unknown) {}
  }

  class SuspendMicrovmCommand {
    constructor(public readonly input: unknown) {}
  }

  class TerminateMicrovmCommand {
    constructor(public readonly input: unknown) {}
  }

  return {
    CreateMicrovmAuthTokenCommand,
    GetMicrovmCommand,
    LambdaMicrovmsClient,
    ResumeMicrovmCommand,
    RunMicrovmCommand,
    SuspendMicrovmCommand,
    TerminateMicrovmCommand,
  };
});

describe("in-app agent lambda microvm sandbox provider", () => {
  beforeEach(() => {
    microvmSendMock.mockReset();
  });

  it("uses suspend for suspendSession and terminate for terminateSession", async () => {
    const { createLambdaMicrovmSandboxProvider } =
      await import("@/src/ee/features/in-app-agent/server/sandbox/providers/lambdaMicrovm");

    const provider = createLambdaMicrovmSandboxProvider({
      imageIdentifier: "image-1",
      executionRoleArn: "arn:aws:iam::123456789012:role/sandbox",
      region: "us-east-1",
    });

    await provider.suspendSession?.({ sessionId: "microvm-1" });
    await provider.terminateSession?.({ sessionId: "microvm-1" });

    expect(microvmSendMock).toHaveBeenCalledTimes(2);
    expect(microvmSendMock.mock.calls[0]?.[0]?.constructor.name).toBe(
      "SuspendMicrovmCommand",
    );
    expect(microvmSendMock.mock.calls[0]?.[0]?.input).toEqual({
      microvmIdentifier: "microvm-1",
    });
    expect(microvmSendMock.mock.calls[1]?.[0]?.constructor.name).toBe(
      "TerminateMicrovmCommand",
    );
    expect(microvmSendMock.mock.calls[1]?.[0]?.input).toEqual({
      microvmIdentifier: "microvm-1",
    });
  });
});
