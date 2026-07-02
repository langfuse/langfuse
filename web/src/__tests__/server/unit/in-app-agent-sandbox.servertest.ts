import { EventType } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSandboxToolCallFiles } from "@/src/ee/features/in-app-agent/server/persistence";
import {
  createInAppAgentSandbox,
  createLambdaMicrovmSandboxProvider,
  type SandboxSnapshotStore,
  type SandboxProvider,
} from "@/src/ee/features/in-app-agent/server/sandbox";

const lambdaSendMock = vi.fn();

vi.mock("@aws-sdk/client-lambda", async () => {
  const actual = await vi.importActual<typeof import("@aws-sdk/client-lambda")>(
    "@aws-sdk/client-lambda",
  );

  class MockLambdaClient {
    send = lambdaSendMock;
  }

  return {
    ...actual,
    LambdaClient: MockLambdaClient,
  };
});

describe("in-app agent sandbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    lambdaSendMock.mockReset();
    vi.useRealTimers();
  });

  it("reuses an active sandbox and restores it after suspension", async () => {
    const files = new Map<string, string>();
    let snapshot = new Map<string, string>();
    let activeSessionId: string | null = null;
    let sessionCounter = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const provider: SandboxProvider = {
      name: "test-fake",
      async ensureSession({ sessionId }) {
        if (sessionId && activeSessionId === sessionId) {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          return { sessionId };
        }

        activeSessionId = `session-${sessionCounter++}`;
        files.clear();
        for (const [path, content] of snapshot.entries()) {
          files.set(path, content);
        }
        return { sessionId: activeSessionId };
      },
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
      scheduleSuspension({ expiresAt }) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          snapshot = new Map(files.entries());
          activeSessionId = null;
        }, Math.max(0, expiresAt.getTime() - Date.now()));
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
    await firstSandbox.write({ path: "notes.txt", content: "hello" });
    const firstSessionId = sandboxState.providerSessionId;

    const secondSandbox = await createSandbox();
    await expect(
      secondSandbox.read({ path: "notes.txt" }),
    ).resolves.toEqual({ path: "notes.txt", content: "hello" });
    expect(sandboxState.providerSessionId).toBe(firstSessionId);

    await firstSandbox.onTurnEnded();
    await vi.advanceTimersByTimeAsync(1_001);

    const restoredSandbox = await createSandbox();
    await expect(
      restoredSandbox.read({ path: "notes.txt" }),
    ).resolves.toEqual({ path: "notes.txt", content: "hello" });
    expect(sandboxState.providerSessionId).not.toBe(firstSessionId);
    expect(sandboxState.sandboxProvider).toBe("test-fake");
    expect(sandboxState.sandboxSnapshotKey).toBe(
      "in-app-agent-sandboxes/project-1/conversation-1.snapshot",
    );
  });

  it("persists sandbox ttl metadata when a turn ends", async () => {
    const provider: SandboxProvider = {
      name: "test-fake",
      async ensureSession() {
        return { sessionId: "session-1" };
      },
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
      async scheduleSuspension() {
        return;
      },
    };
    const savedStates: Array<Record<string, unknown>> = [];
    const sandbox = await createInAppAgentSandbox({
      conversationId: "conversation-1",
      projectId: "project-1",
      ttlMs: 1_000,
      provider,
      getToolCallFiles: async () => [],
      saveState: async (state) => {
        savedStates.push(state);
      },
      now: () => new Date("2026-07-02T12:00:00.000Z"),
    });

    await sandbox.write({ path: "notes.txt", content: "hello" });
    await sandbox.onTurnEnded();

    expect(savedStates[0]).toMatchObject({
      providerSessionId: "session-1",
      sandboxProvider: "test-fake",
      sandboxSnapshotKey:
        "in-app-agent-sandboxes/project-1/conversation-1.snapshot",
      sandboxExpiresAt: null,
    });
    expect(savedStates[1]).toMatchObject({
      providerSessionId: "session-1",
      sandboxProvider: "test-fake",
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

  it("restores lambda sandbox state after recreating the provider", async () => {
    const snapshots = new Map<string, Uint8Array>();
    const snapshotStore: SandboxSnapshotStore = {
      deleteSnapshot: vi.fn(),
      getSnapshot: vi.fn(async (key: string) => snapshots.get(key) ?? null),
      putSnapshot: vi.fn(async (key: string, snapshot: Uint8Array) => {
        snapshots.set(key, snapshot);
      }),
    };

    lambdaSendMock.mockImplementation(async (command: { input: { Payload?: Uint8Array } }) => {
      const payloadText = Buffer.from(command.input.Payload ?? []).toString("utf8");
      const payload = JSON.parse(payloadText) as {
        operation: "read" | "write";
        path?: string;
        content?: string;
        snapshotTarBase64: string | null;
      };
      const files = payload.snapshotTarBase64
        ? (JSON.parse(Buffer.from(payload.snapshotTarBase64, "base64").toString("utf8")) as Record<
            string,
            string
          >)
        : {};

      if (payload.operation === "write" && payload.path) {
        files[payload.path] = payload.content ?? "";
      }

      const result =
        payload.operation === "read" && payload.path
          ? { path: payload.path, content: files[payload.path] ?? null }
          : { path: payload.path, bytesWritten: Buffer.byteLength(payload.content ?? "", "utf8") };

      return {
        Payload: Buffer.from(
          JSON.stringify({
            result,
            snapshotTarBase64: Buffer.from(JSON.stringify(files), "utf8").toString(
              "base64",
            ),
          }),
        ),
      };
    });

    let provider = createLambdaMicrovmSandboxProvider({
      functionName: "sandbox-fn",
      snapshotStore,
    });

    const firstSession = await provider.ensureSession({
      sessionId: null,
      snapshotKey: "snapshots/conversation-1.tar",
    });
    await provider.write({
      sessionId: firstSession.sessionId,
      path: "notes.txt",
      content: "hello",
    });

    provider = createLambdaMicrovmSandboxProvider({
      functionName: "sandbox-fn",
      snapshotStore,
    });

    const restoredSession = await provider.ensureSession({
      sessionId: firstSession.sessionId,
      snapshotKey: "snapshots/conversation-1.tar",
    });

    await expect(
      provider.read({ sessionId: restoredSession.sessionId, path: "notes.txt" }),
    ).resolves.toEqual({ path: "notes.txt", content: "hello" });
    expect(restoredSession.sessionId).toBe(firstSession.sessionId);
    expect(snapshotStore.putSnapshot).toHaveBeenCalled();
  });
});
