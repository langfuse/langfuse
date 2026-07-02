import { randomUUID } from "crypto";

import {
  InvokeCommand,
  LambdaClient,
  type InvokeCommandInput,
} from "@aws-sdk/client-lambda";

import type { SandboxFile } from "../types";
import type { SandboxSnapshotStore } from "../snapshotStore";
import type { SandboxProvider } from "../types";

const LAMBDA_SANDBOX_TIMEOUT_MS = 30_000;

type LambdaSandboxOperation =
  | { operation: "read"; path: string }
  | { operation: "write"; path: string; content: string }
  | { operation: "edit"; path: string; oldText: string; newText: string }
  | { operation: "bash"; command: string; timeoutMs?: number };

type LambdaSandboxResponse = {
  result: unknown;
  snapshotTarBase64: string | null;
};

type LambdaSession = {
  snapshotKey: string;
  snapshotTar: Uint8Array | null;
  toolCallFiles: ReadonlyArray<SandboxFile>;
};

export function createLambdaMicrovmSandboxProvider(params: {
  endpoint?: string;
  functionName: string;
  snapshotStore: SandboxSnapshotStore;
}): SandboxProvider {
  const lambdaClient = new LambdaClient({
    ...(params.endpoint ? { endpoint: params.endpoint } : {}),
    requestHandler: {
      requestTimeout: LAMBDA_SANDBOX_TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
  });
  const sessions = new Map<string, LambdaSession>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    name: "lambda-microvm",
    async ensureSession({ sessionId, snapshotKey }) {
      if (sessionId) {
        const timer = timers.get(sessionId);
        if (timer) {
          clearTimeout(timer);
          timers.delete(sessionId);
        }

        if (!sessions.has(sessionId)) {
          sessions.set(sessionId, {
            snapshotKey,
            snapshotTar: await params.snapshotStore.getSnapshot(snapshotKey),
            toolCallFiles: [],
          });
        }

        return { sessionId };
      }

      const nextSessionId = randomUUID();
      sessions.set(nextSessionId, {
        snapshotKey,
        snapshotTar: await params.snapshotStore.getSnapshot(snapshotKey),
        toolCallFiles: [],
      });
      return { sessionId: nextSessionId };
    },
    async syncReadonlyFiles({ sessionId, files }) {
      getSession(sessions, sessionId).toolCallFiles = files;
    },
    async read({ sessionId, path }) {
      return await executeLambdaOperation({
        lambdaClient,
        functionName: params.functionName,
        operation: { operation: "read", path },
        session: getSession(sessions, sessionId),
        snapshotStore: params.snapshotStore,
      });
    },
    async write({ sessionId, path, content }) {
      return await executeLambdaOperation({
        lambdaClient,
        functionName: params.functionName,
        operation: { operation: "write", path, content },
        session: getSession(sessions, sessionId),
        snapshotStore: params.snapshotStore,
      });
    },
    async edit({ sessionId, path, oldText, newText }) {
      return await executeLambdaOperation({
        lambdaClient,
        functionName: params.functionName,
        operation: { operation: "edit", path, oldText, newText },
        session: getSession(sessions, sessionId),
        snapshotStore: params.snapshotStore,
      });
    },
    async bash({ sessionId, command, timeoutMs }) {
      return await executeLambdaOperation({
        lambdaClient,
        functionName: params.functionName,
        operation: { operation: "bash", command, timeoutMs },
        session: getSession(sessions, sessionId),
        snapshotStore: params.snapshotStore,
      });
    },
    async scheduleSuspension({ sessionId, snapshotKey, expiresAt }) {
      const existingTimer = timers.get(sessionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const delayMs = Math.max(0, expiresAt.getTime() - Date.now());
      const timer = setTimeout(async () => {
        try {
          const session = sessions.get(sessionId);
          if (session?.snapshotTar) {
            await params.snapshotStore.putSnapshot(snapshotKey, session.snapshotTar);
          }
        } finally {
          sessions.delete(sessionId);
          timers.delete(sessionId);
        }
      }, delayMs);
      timers.set(sessionId, timer);
    },
  };
}

async function invokeLambdaOperation(params: {
  functionName: string;
  lambdaClient: LambdaClient;
  operation: LambdaSandboxOperation;
  session: LambdaSession;
}) {
  const commandInput: InvokeCommandInput = {
    FunctionName: params.functionName,
    InvocationType: "RequestResponse",
    Payload: Buffer.from(
      JSON.stringify({
        ...params.operation,
        snapshotTarBase64: params.session.snapshotTar
          ? Buffer.from(params.session.snapshotTar).toString("base64")
          : null,
        toolCallFiles: params.session.toolCallFiles,
      }),
    ),
  };
  const response = await params.lambdaClient.send(new InvokeCommand(commandInput));

  if (response.FunctionError) {
    throw new Error(
      `Sandbox Lambda ${params.functionName} failed with ${response.FunctionError}`,
    );
  }

  if (!response.Payload) {
    throw new Error(`Sandbox Lambda ${params.functionName} returned an empty response`);
  }

  const parsed = JSON.parse(
    Buffer.from(response.Payload).toString("utf8"),
  ) as LambdaSandboxResponse;
  params.session.snapshotTar = parsed.snapshotTarBase64
    ? Buffer.from(parsed.snapshotTarBase64, "base64")
    : null;
  return parsed.result;
}

async function executeLambdaOperation(params: {
  functionName: string;
  lambdaClient: LambdaClient;
  operation: LambdaSandboxOperation;
  session: LambdaSession;
  snapshotStore: SandboxSnapshotStore;
}) {
  const result = await invokeLambdaOperation(params);

  if (params.session.snapshotTar) {
    await params.snapshotStore.putSnapshot(
      params.session.snapshotKey,
      params.session.snapshotTar,
    );
  } else {
    await params.snapshotStore.deleteSnapshot(params.session.snapshotKey);
  }

  return result;
}

function getSession(sessions: Map<string, LambdaSession>, sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Missing sandbox session: ${sessionId}`);
  }
  return session;
}
