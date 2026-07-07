import { EventType } from "@ag-ui/core";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as LambdaMicrovmsModule from "@aws-sdk/client-lambda-microvms";
import type Docker from "dockerode";
import type * as SharedServerModule from "@langfuse/shared/src/server";

import { getSandboxToolCallFiles } from "@/src/ee/features/in-app-agent/server/persistence";
import {
  createDockerSandboxProvider,
  createInAppAgentSandbox,
  createLambdaMicrovmSandboxProvider,
  type SandboxProvider,
} from "@/src/ee/features/in-app-agent/server/sandbox";

const lambdaMicrovmsSendMock = vi.fn();
const fetchMock = vi.fn();
const dockerMockState = vi.hoisted(() => {
  type ContainerState = {
    id: string;
    running: boolean;
    logs?: string;
    start: ReturnType<typeof vi.fn>;
    putArchive: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    getArchive: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
    inspect: ReturnType<typeof vi.fn>;
  };

  const toContainerHandle = (container: ContainerState) => ({
    id: container.id,
    start: container.start,
    putArchive: container.putArchive,
    remove: container.remove,
    getArchive: container.getArchive,
    exec: container.exec,
    inspect: container.inspect,
    logs: vi.fn(async () => Buffer.from(container.logs ?? "", "utf8")),
    modem: {
      demuxStream: (
        stream: NodeJS.ReadableStream,
        stdout: NodeJS.WritableStream,
        stderr: NodeJS.WritableStream,
      ) => {
        stream.pipe(stdout);
        stream.on("end", () => stderr.end());
        stream.on("close", () => stderr.end());
      },
    },
  });

  const containers = new Map<string, ContainerState>();
  let nextId = 1;

  const createExec = (container: ContainerState, cmd: string[]) => {
    const isHealthCheck = cmd.join(" ").includes("/health");
    const stdout = isHealthCheck ? '{"status":"ok"}' : "null";
    const stderr = "";
    const exitCode = container.running ? 0 : 1;

    return {
      start: vi.fn(async () => {
        const stream = new PassThrough();
        queueMicrotask(() => {
          if (exitCode === 0) {
            stream.write(stdout);
          } else {
            stream.write(stderr || "container not running");
          }
          stream.end();
        });
        return stream;
      }),
      inspect: vi.fn(async () => ({ ExitCode: exitCode })),
      stdout,
      stderr: stderr || (exitCode === 0 ? "" : "container not running"),
    };
  };

  const registerContainer = (params?: {
    id?: string;
    running?: boolean;
    logs?: string;
  }) => {
    const id = params?.id ?? `container-${nextId++}`;
    const container: ContainerState = {
      id,
      running: params?.running ?? false,
      logs: params?.logs,
      start: vi.fn(async () => {
        container.running = true;
      }),
      putArchive: vi.fn(async () => undefined),
      remove: vi.fn(async () => {
        containers.delete(id);
      }),
      getArchive: vi.fn(async () => new PassThrough()),
      exec: vi.fn(async ({ Cmd }: { Cmd: string[] }) =>
        createExec(container, Cmd),
      ),
      inspect: vi.fn(async () => ({
        Id: id,
        State: {
          Running: container.running,
          Status: container.running ? "running" : "exited",
          ExitCode: container.running ? 0 : 137,
          Error: container.running ? "" : "container exited",
        },
      })),
    };
    containers.set(id, container);
    return container;
  };

  const dockerApi = {
    createContainer: vi.fn(async () => toContainerHandle(registerContainer())),
    getContainer: vi.fn((id: string) => {
      const container = containers.get(id);
      if (!container) {
        throw new Error(`Unknown container: ${id}`);
      }
      return toContainerHandle(
        container,
      ) satisfies Partial<Docker.Container> & {
        id: string;
        modem: { demuxStream: Docker.Container["modem"]["demuxStream"] };
      };
    }),
  };

  return {
    dockerApi,
    registerContainer,
    reset() {
      containers.clear();
      nextId = 1;
      dockerApi.createContainer.mockClear();
      dockerApi.getContainer.mockClear();
    },
  };
});

vi.mock("dockerode", () => ({
  default: class MockDocker {
    createContainer = dockerMockState.dockerApi.createContainer;
    getContainer = dockerMockState.dockerApi.getContainer;
  },
}));

vi.mock("@aws-sdk/client-lambda-microvms", async () => {
  const actual = (await vi.importActual(
    "@aws-sdk/client-lambda-microvms",
  )) as typeof LambdaMicrovmsModule;

  class MockLambdaMicrovmsClient {
    send = lambdaMicrovmsSendMock;
  }

  return {
    ...actual,
    LambdaMicrovmsClient: MockLambdaMicrovmsClient,
  };
});

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = (await vi.importActual(
    "@langfuse/shared/src/server",
  )) as typeof SharedServerModule;

  return {
    ...actual,
    getInAppAgentSandboxSnapshotKey: (
      projectId: string,
      conversationId: string,
    ) => `in-app-agent-sandboxes/${projectId}/${conversationId}.snapshot`,
  };
});

describe("in-app agent sandbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    lambdaMicrovmsSendMock.mockReset();
    fetchMock.mockReset();
    dockerMockState.reset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reuses an active sandbox and restores it after suspension", async () => {
    const files = new Map<string, string>();
    let snapshot = new Map<string, string>();
    let activeSessionId: string | null = null;
    let sessionCounter = 0;
    const sandboxSession = {
      async syncReadonlyFiles({ files: readonlyFiles }) {
        for (const key of Array.from(files.keys())) {
          if (key.startsWith("tool_calls/")) files.delete(key);
        }
        for (const file of readonlyFiles) {
          files.set(file.path, file.content);
        }
      },
      async read({ path }) {
        return { path, content: files.get(path) ?? null };
      },
      async write({ path, content }) {
        files.set(path, content);
        return { path, bytesWritten: content.length };
      },
      async edit({ path, oldText, newText }) {
        const current = files.get(path) ?? "";
        const replaced = current.includes(oldText);
        if (replaced) files.set(path, current.replace(oldText, newText));
        return { path, replaced };
      },
      async bash() {
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    };
    const provider: SandboxProvider = {
      async ensureSession({ sessionId }) {
        if (sessionId && activeSessionId === sessionId) {
          return { sessionId, sandbox: sandboxSession };
        }

        activeSessionId = `session-${sessionCounter++}`;
        files.clear();
        for (const [path, content] of snapshot.entries()) {
          files.set(path, content);
        }
        return { sessionId: activeSessionId, sandbox: sandboxSession };
      },
      async suspendSession({ sessionId }) {
        if (sessionId !== activeSessionId) {
          return;
        }

        snapshot = new Map(files.entries());
        activeSessionId = null;
      },
    };
    let sandboxState: {
      providerSessionId: string | null;
      sandboxExpiresAt: Date | null;
      sandboxProvider: string | null;
      sandboxSnapshotKey: string | null;
    } = {
      providerSessionId: null,
      sandboxExpiresAt: null,
      sandboxProvider: null,
      sandboxSnapshotKey: null,
    };

    const createSandbox = () =>
      createInAppAgentSandbox({
        conversationId: "conversation-1",
        projectId: "project-1",
        providerSessionId: sandboxState.providerSessionId,
        sandboxExpiresAt: sandboxState.sandboxExpiresAt,
        sandboxProvider: sandboxState.sandboxProvider,
        sandboxSnapshotKey: sandboxState.sandboxSnapshotKey,
        ttlMs: 1_000,
        providerType: "dangerous-docker",
        provider,
        getToolCallFiles: async () => [],
        saveState: async (nextState) => {
          sandboxState = {
            ...sandboxState,
            ...nextState,
            providerSessionId:
              nextState.providerSessionId ?? sandboxState.providerSessionId,
            sandboxExpiresAt:
              nextState.sandboxExpiresAt ?? sandboxState.sandboxExpiresAt,
            sandboxProvider:
              nextState.sandboxProvider ?? sandboxState.sandboxProvider,
            sandboxSnapshotKey:
              nextState.sandboxSnapshotKey ?? sandboxState.sandboxSnapshotKey,
          };
        },
      });

    const firstSandbox = await createSandbox();
    await firstSandbox.sandbox.write({ path: "notes.txt", content: "hello" });
    const firstSessionId = sandboxState.providerSessionId;

    const secondSandbox = await createSandbox();
    await expect(
      secondSandbox.sandbox.read({ path: "notes.txt" }),
    ).resolves.toEqual({
      path: "notes.txt",
      content: "hello",
    });
    expect(sandboxState.providerSessionId).toBe(firstSessionId);

    await firstSandbox.onTurnEnded();
    await vi.advanceTimersByTimeAsync(1_001);

    const restoredSandbox = await createSandbox();
    await expect(
      restoredSandbox.sandbox.read({ path: "notes.txt" }),
    ).resolves.toEqual({
      path: "notes.txt",
      content: "hello",
    });
    expect(sandboxState.providerSessionId).not.toBe(firstSessionId);
    expect(sandboxState.sandboxProvider).toBe("dangerous-docker");
    expect(sandboxState.sandboxSnapshotKey).toBe(
      "in-app-agent-sandboxes/project-1/conversation-1.snapshot",
    );
  });

  it("persists sandbox ttl metadata when a turn ends", async () => {
    const sandboxSession = {
      async syncReadonlyFiles() {},
      async read() {
        return { path: "notes.txt", content: null };
      },
      async write() {
        return { path: "notes.txt", bytesWritten: 0 };
      },
      async edit() {
        return { path: "notes.txt", replaced: false };
      },
      async bash() {
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    };
    const provider: SandboxProvider = {
      async ensureSession() {
        return { sessionId: "session-1", sandbox: sandboxSession };
      },
      async scheduleSuspension() {
        return;
      },
    };
    const savedStates: Array<Record<string, unknown>> = [];
    const sandbox = await createInAppAgentSandbox({
      conversationId: "conversation-1",
      projectId: "project-1",
      ttlMs: 1_000,
      providerType: "dangerous-docker",
      provider,
      getToolCallFiles: async () => [],
      saveState: async (state) => {
        savedStates.push(state);
      },
      now: () => new Date("2026-07-02T12:00:00.000Z"),
    });

    await sandbox.sandbox.write({ path: "notes.txt", content: "hello" });
    await sandbox.onTurnEnded();

    expect(savedStates[0]).toMatchObject({
      providerSessionId: "session-1",
      sandboxProvider: "dangerous-docker",
      sandboxSnapshotKey:
        "in-app-agent-sandboxes/project-1/conversation-1.snapshot",
      sandboxExpiresAt: null,
    });
    expect(savedStates[1]).toMatchObject({
      providerSessionId: "session-1",
      sandboxProvider: "dangerous-docker",
      sandboxSnapshotKey:
        "in-app-agent-sandboxes/project-1/conversation-1.snapshot",
    });
    expect(savedStates[1]?.sandboxExpiresAt).toEqual(
      new Date("2026-07-02T12:00:01.000Z"),
    );
  });

  it("exports prior non-sandbox tool calls into tool_calls files", () => {
    const files = getSandboxToolCallFiles([
      {
        createdAt: new Date("2026-07-02T12:00:00.000Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-call-1",
          toolCallName: "langfuse_getHealth",
        },
      },
      {
        createdAt: new Date("2026-07-02T12:00:00.100Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: "tool-call-1",
          delta: '{"projectId":"project-1"}',
        },
      },
      {
        createdAt: new Date("2026-07-02T12:00:00.200Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-call-1",
          content: '{"status":"ok"}',
        },
      },
      {
        createdAt: new Date("2026-07-02T12:00:01.000Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-call-2",
          toolCallName: "read",
        },
      },
      {
        createdAt: new Date("2026-07-02T12:00:01.100Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: "tool-call-2",
          delta: '{"path":"tool_calls/file.json"}',
        },
      },
      {
        createdAt: new Date("2026-07-02T12:00:01.200Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-call-2",
          content: '{"content":"ignored"}',
        },
      },
    ]);

    expect(files).toEqual([
      {
        path: "tool_calls/2026-07-02T12-00-00.000Z_langfuse_getHealth.json",
        content: JSON.stringify(
          {
            request: { projectId: "project-1" },
            response: { status: "ok" },
            error: null,
          },
          null,
          2,
        ),
      },
    ]);
  });

  it("recreates stopped docker sandbox sessions instead of waiting for them", async () => {
    vi.useRealTimers();

    const stoppedContainer = dockerMockState.registerContainer({
      id: "stopped-session",
      running: false,
    });
    const provider = createDockerSandboxProvider({
      image: "langfuse-in-app-agent-sandbox:latest",
      snapshotStore: {
        getSnapshot: async () => null,
        putSnapshot: async () => undefined,
        deleteSnapshot: async () => undefined,
      },
    });

    const session = await provider.ensureSession({
      conversationId: "conversation-1",
      sessionId: stoppedContainer.id,
      snapshotKey: "snapshots/conversation-1.tar",
    });

    expect(session.sessionId).not.toBe(stoppedContainer.id);
    expect(stoppedContainer.exec).not.toHaveBeenCalled();
    expect(dockerMockState.dockerApi.createContainer).toHaveBeenCalledTimes(1);
  });

  it("reconnects to a running lambda microvm after recreating the provider", async () => {
    const files = new Map<string, string>();

    lambdaMicrovmsSendMock.mockImplementation(
      async (command: {
        constructor: { name: string };
        input: Record<string, unknown>;
      }) => {
        switch (command.constructor.name) {
          case "RunMicrovmCommand":
            return {
              microvmId: "microvm-1",
              endpoint: "sandbox.example.internal",
              state: "RUNNING",
            };
          case "GetMicrovmCommand":
            return {
              microvmId: command.input.microvmIdentifier,
              endpoint: "sandbox.example.internal",
              state: "RUNNING",
            };
          case "CreateMicrovmAuthTokenCommand":
            return {
              authToken: {
                "X-aws-proxy-auth": "proxy-token",
              },
            };
          default:
            throw new Error(`Unexpected command: ${command.constructor.name}`);
        }
      },
    );

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === "https://sandbox.example.internal/health") {
        return new Response(null, { status: 200 });
      }

      if (input !== "https://sandbox.example.internal/sandbox") {
        throw new Error(`Unexpected fetch URL: ${input}`);
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        operation: "read" | "write";
        path?: string;
        content?: string;
      };

      if (payload.operation === "write" && payload.path) {
        files.set(payload.path, payload.content ?? "");
        return Response.json({
          result: {
            path: payload.path,
            bytesWritten: Buffer.byteLength(payload.content ?? "", "utf8"),
          },
        });
      }

      return Response.json({
        result: {
          path: payload.path,
          content: payload.path ? (files.get(payload.path) ?? null) : null,
        },
      });
    });

    let provider = createLambdaMicrovmSandboxProvider({
      imageIdentifier:
        "arn:aws:lambda:us-east-1:123456789012:microvm-image:sandbox",
    });

    const firstSession = await provider.ensureSession({
      conversationId: "conversation-1",
      sessionId: null,
      snapshotKey: "snapshots/conversation-1.tar",
    });
    await firstSession.sandbox.write({
      path: "notes.txt",
      content: "hello",
    });

    provider = createLambdaMicrovmSandboxProvider({
      imageIdentifier:
        "arn:aws:lambda:us-east-1:123456789012:microvm-image:sandbox",
    });

    const restoredSession = await provider.ensureSession({
      conversationId: "conversation-1",
      sessionId: firstSession.sessionId,
      snapshotKey: "snapshots/conversation-1.tar",
    });

    await expect(
      restoredSession.sandbox.read({ path: "notes.txt" }),
    ).resolves.toEqual({
      path: "notes.txt",
      content: "hello",
    });
    expect(restoredSession.sessionId).toBe(firstSession.sessionId);
    expect(lambdaMicrovmsSendMock).toHaveBeenCalled();
  });
});
