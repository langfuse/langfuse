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
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses suspend for suspendSession and terminate for terminateSession", async () => {
    const { createLambdaMicrovmSandboxProvider } =
      await import("@langfuse/shared/in-app-agent/server/sandbox/providers/lambdaMicrovm");

    const provider = createLambdaMicrovmSandboxProvider({
      imageIdentifier: "image-1",
      executionRoleArn: "arn:aws:iam::123456789012:role/sandbox",
      egressNetworkConnectorArn:
        "arn:aws:lambda:us-east-1:123456789012:network-connector:deny-all",
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

  it("omits egress network connectors when no connector ARN is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 200 })),
    );
    microvmSendMock.mockImplementation(async (command: { input: unknown }) => {
      if (command.constructor.name === "RunMicrovmCommand") {
        return {
          microvmId: "microvm-1",
          endpoint: "https://microvm.example.com:8443",
          state: "RUNNING",
        };
      }

      if (command.constructor.name === "GetMicrovmCommand") {
        return {
          microvmId: "microvm-1",
          endpoint: "https://microvm.example.com:8443",
          state: "RUNNING",
        };
      }

      if (command.constructor.name === "CreateMicrovmAuthTokenCommand") {
        return { authToken: { "X-aws-proxy-auth": "token-1" } };
      }

      throw new Error(`Unexpected command ${command.constructor.name}`);
    });

    const { createLambdaMicrovmSandboxProvider } =
      await import("@langfuse/shared/in-app-agent/server/sandbox/providers/lambdaMicrovm");
    const provider = createLambdaMicrovmSandboxProvider({
      imageIdentifier: "image-1",
      executionRoleArn: "arn:aws:iam::123456789012:role/sandbox",
      region: "us-east-1",
    });

    await provider.ensureSession({ conversationId: "conversation-1" });

    expect(
      microvmSendMock.mock.calls.find(
        ([command]) => command.constructor.name === "RunMicrovmCommand",
      )?.[0]?.input,
    ).not.toHaveProperty("egressNetworkConnectors");
  });

  it("reuses the microvm endpoint and refreshes expired auth tokens", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const urlString = String(url);
      if (urlString.endsWith("/health")) {
        return new Response(null, { status: 200 });
      }

      return Response.json({ result: { content: "hello" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    microvmSendMock.mockImplementation(async (command: { input: unknown }) => {
      if (command.constructor.name === "RunMicrovmCommand") {
        return {
          microvmId: "microvm-1",
          endpoint: "https://microvm.example.com:8443",
          state: "RUNNING",
        };
      }

      if (command.constructor.name === "GetMicrovmCommand") {
        return {
          microvmId: "microvm-1",
          endpoint: "https://microvm.example.com:8443",
          state: "RUNNING",
        };
      }

      if (command.constructor.name === "CreateMicrovmAuthTokenCommand") {
        const tokenNumber = microvmSendMock.mock.calls.filter(
          ([calledCommand]) =>
            calledCommand.constructor.name === "CreateMicrovmAuthTokenCommand",
        ).length;
        return { authToken: { "X-aws-proxy-auth": `token-${tokenNumber}` } };
      }

      throw new Error(`Unexpected command ${command.constructor.name}`);
    });

    const { createLambdaMicrovmSandboxProvider } =
      await import("@langfuse/shared/in-app-agent/server/sandbox/providers/lambdaMicrovm");
    const provider = createLambdaMicrovmSandboxProvider({
      imageIdentifier: "image-1",
      executionRoleArn: "arn:aws:iam::123456789012:role/sandbox",
      egressNetworkConnectorArn:
        "arn:aws:lambda:us-east-1:123456789012:network-connector:deny-all",
      region: "us-east-1",
    });

    const session = await provider.ensureSession({
      conversationId: "conversation-1",
    });

    expect(
      microvmSendMock.mock.calls.find(
        ([command]) => command.constructor.name === "RunMicrovmCommand",
      )?.[0]?.input,
    ).toMatchObject({
      egressNetworkConnectors: [
        "arn:aws:lambda:us-east-1:123456789012:network-connector:deny-all",
      ],
    });

    await session.sandbox.read({ path: "notes.txt" });
    vi.setSystemTime(new Date("2026-01-01T00:28:00Z"));
    await session.sandbox.read({ path: "notes.txt" });
    vi.setSystemTime(new Date("2026-01-01T00:29:01Z"));
    await session.sandbox.read({ path: "notes.txt" });

    expect(
      microvmSendMock.mock.calls.filter(
        ([command]) => command.constructor.name === "GetMicrovmCommand",
      ),
    ).toHaveLength(1);
    expect(
      microvmSendMock.mock.calls.filter(
        ([command]) =>
          command.constructor.name === "CreateMicrovmAuthTokenCommand",
      ),
    ).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: { "X-aws-proxy-auth": "token-2" },
    });
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      headers: { "X-aws-proxy-auth": "token-2" },
    });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      headers: { "X-aws-proxy-auth": "token-3" },
    });
  });

  it("aborts a hung sandbox operation request", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn<typeof fetch>().mockImplementation((url, init) => {
      if (String(url).endsWith("/health")) {
        return Promise.resolve(new Response(null, { status: 200 }));
      }

      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    microvmSendMock.mockImplementation(async (command: { input: unknown }) => {
      if (command.constructor.name === "RunMicrovmCommand") {
        return {
          microvmId: "microvm-1",
          endpoint: "https://microvm.example.com:8443",
          state: "RUNNING",
        };
      }

      if (command.constructor.name === "GetMicrovmCommand") {
        return {
          microvmId: "microvm-1",
          endpoint: "https://microvm.example.com:8443",
          state: "RUNNING",
        };
      }

      if (command.constructor.name === "CreateMicrovmAuthTokenCommand") {
        return { authToken: { "X-aws-proxy-auth": "token-1" } };
      }

      throw new Error(`Unexpected command ${command.constructor.name}`);
    });

    const { createLambdaMicrovmSandboxProvider } =
      await import("@langfuse/shared/in-app-agent/server/sandbox/providers/lambdaMicrovm");
    const provider = createLambdaMicrovmSandboxProvider({
      imageIdentifier: "image-1",
      executionRoleArn: "arn:aws:iam::123456789012:role/sandbox",
      region: "us-east-1",
    });
    const session = await provider.ensureSession({
      conversationId: "conversation-1",
    });

    const operation = session.sandbox.read({ path: "notes.txt" });
    const rejection = expect(operation).rejects.toThrow(
      "Lambda MicroVM operation request timed out after 30000ms",
    );

    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;

    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
  });

  it("aborts a hung health probe within the bridge readiness deadline", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    microvmSendMock.mockImplementation(async (command: { input: unknown }) => {
      if (
        command.constructor.name === "RunMicrovmCommand" ||
        command.constructor.name === "GetMicrovmCommand"
      ) {
        return {
          microvmId: "microvm-1",
          endpoint: "https://microvm.example.com:8443",
          state: "RUNNING",
        };
      }

      if (command.constructor.name === "CreateMicrovmAuthTokenCommand") {
        return { authToken: { "X-aws-proxy-auth": "token-1" } };
      }

      throw new Error(`Unexpected command ${command.constructor.name}`);
    });

    const { createLambdaMicrovmSandboxProvider } =
      await import("@langfuse/shared/in-app-agent/server/sandbox/providers/lambdaMicrovm");
    const provider = createLambdaMicrovmSandboxProvider({
      imageIdentifier: "image-1",
      executionRoleArn: "arn:aws:iam::123456789012:role/sandbox",
      region: "us-east-1",
    });

    const ensureSession = provider.ensureSession({
      conversationId: "conversation-1",
    });
    const rejection = expect(ensureSession).rejects.toThrow(
      "Lambda MicroVM bridge health probe timed out",
    );

    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
