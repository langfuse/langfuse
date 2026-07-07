import { randomUUID } from "crypto";

import {
  CreateMicrovmAuthTokenCommand,
  GetMicrovmCommand,
  LambdaMicrovmsClient,
  ResumeMicrovmCommand,
  RunMicrovmCommand,
  SuspendMicrovmCommand,
  type RunMicrovmCommandInput,
} from "@aws-sdk/client-lambda-microvms";
import type { SandboxFile } from "@repo/in-app-agent-sandbox-server";
import { z } from "zod";

import type { SandboxProvider, SandboxSession } from "../types";

const DEFAULT_AUTH_TOKEN_EXPIRATION_MINUTES = 30;
const DEFAULT_BRIDGE_PORT = 5000;
const DEFAULT_IDLE_TIMEOUT_SECONDS = 900;
const DEFAULT_SUSPENDED_DURATION_SECONDS = 300;
const BRIDGE_READY_TIMEOUT_MS = 30_000;

const LambdaMicrovmErrorSchema = z.object({
  name: z.string().optional(),
  $metadata: z
    .object({
      httpStatusCode: z.number().optional(),
    })
    .optional(),
});

type LambdaMicrovmOperation =
  | { operation: "read"; path: string }
  | { operation: "write"; path: string; content: string }
  | { operation: "edit"; path: string; oldText: string; newText: string }
  | { operation: "bash"; command: string; timeoutMs?: number };

type LambdaMicrovmSession = {
  toolCallFiles: ReadonlyArray<SandboxFile>;
};

type LambdaMicrovmInfo = {
  microvmId: string;
  endpoint: string;
  state: string;
};

export function createLambdaMicrovmSandboxProvider(params: {
  endpoint?: string;
  imageIdentifier: string;
  executionRoleArn?: string;
  bridgePort?: number;
}): SandboxProvider {
  const client = new LambdaMicrovmsClient({
    ...(params.endpoint ? { endpoint: params.endpoint } : {}),
  });
  const sessions = new Map<string, LambdaMicrovmSession>();
  const bridgePort = params.bridgePort ?? DEFAULT_BRIDGE_PORT;

  const ensureSession = async (sessionId?: string | null) => {
    if (sessionId) {
      const existing = await getMicrovm(client, sessionId);
      if (existing) {
        if (existing.state === "SUSPENDED") {
          await client.send(
            new ResumeMicrovmCommand({ microvmIdentifier: sessionId }),
          );
        }

        await waitForBridge({
          client,
          microvmId: sessionId,
          endpoint: existing.endpoint,
          bridgePort,
        });

        sessions.set(
          sessionId,
          sessions.get(sessionId) ?? { toolCallFiles: [] },
        );
        return { sessionId, endpoint: existing.endpoint };
      }

      sessions.delete(sessionId);
    }

    const microvm = readMicrovmInfo(
      await client.send(
        new RunMicrovmCommand({
          imageIdentifier: params.imageIdentifier,
          ...(params.executionRoleArn
            ? { executionRoleArn: params.executionRoleArn }
            : {}),
          idlePolicy: {
            autoResumeEnabled: true,
            maxIdleDurationSeconds: DEFAULT_IDLE_TIMEOUT_SECONDS,
            suspendedDurationSeconds: DEFAULT_SUSPENDED_DURATION_SECONDS,
          },
          runHookPayload: JSON.stringify({ bridgePort }),
          clientToken: randomUUID(),
        } satisfies RunMicrovmCommandInput),
      ),
    );

    sessions.set(microvm.microvmId, { toolCallFiles: [] });
    await waitForBridge({
      client,
      microvmId: microvm.microvmId,
      endpoint: microvm.endpoint,
      bridgePort,
    });

    return { sessionId: microvm.microvmId, endpoint: microvm.endpoint };
  };

  const executeOperation = async (
    sessionId: string,
    operation: LambdaMicrovmOperation,
  ) => {
    const session = getSession(sessions, sessionId);
    const microvm = await getMicrovm(client, sessionId);
    if (!microvm) {
      throw new Error(`Missing sandbox session: ${sessionId}`);
    }

    const response = await fetch(
      `${normalizeEndpoint(microvm.endpoint)}/sandbox`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-aws-proxy-auth": await createMicrovmAuthToken({
            client,
            microvmId: sessionId,
            bridgePort,
          }),
        },
        body: JSON.stringify({
          ...operation,
          toolCallFiles: session.toolCallFiles,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        (await response.text()) ||
          `Lambda MicroVM bridge request failed: ${response.status}`,
      );
    }

    const result = (await response.json()) as unknown;
    if (isRecord(result) && "result" in result) {
      return result.result;
    }

    return result;
  };

  const createSessionSandbox = (sessionId: string): SandboxSession => ({
    async syncReadonlyFiles({ files }) {
      getSession(sessions, sessionId).toolCallFiles = files;
    },
    async read({ path }) {
      return await executeOperation(sessionId, { operation: "read", path });
    },
    async write({ path, content }) {
      return await executeOperation(sessionId, {
        operation: "write",
        path,
        content,
      });
    },
    async edit({ path, oldText, newText }) {
      return await executeOperation(sessionId, {
        operation: "edit",
        path,
        oldText,
        newText,
      });
    },
    async bash({ command, timeoutMs }) {
      return await executeOperation(sessionId, {
        operation: "bash",
        command,
        ...(timeoutMs ? { timeoutMs } : {}),
      });
    },
  });

  return {
    async ensureSession({ sessionId }) {
      const session = await ensureSession(sessionId);
      return {
        sessionId: session.sessionId,
        sandbox: createSessionSandbox(session.sessionId),
      };
    },
    async suspendSession({ sessionId }) {
      sessions.delete(sessionId);

      try {
        await client.send(
          new SuspendMicrovmCommand({ microvmIdentifier: sessionId }),
        );
      } catch (error) {
        if (!isMissingMicrovmError(error)) {
          throw error;
        }
      }
    },
    async terminateSession({ sessionId }) {
      sessions.delete(sessionId);

      try {
        await client.send(
          new SuspendMicrovmCommand({ microvmIdentifier: sessionId }),
        );
      } catch (error) {
        if (!isMissingMicrovmError(error)) {
          throw error;
        }
      }
    },
  };
}

async function waitForBridge(params: {
  client: LambdaMicrovmsClient;
  microvmId: string;
  endpoint: string;
  bridgePort: number;
}) {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < BRIDGE_READY_TIMEOUT_MS) {
    try {
      const response = await fetch(
        `${normalizeEndpoint(params.endpoint)}/health`,
        {
          headers: {
            "X-aws-proxy-auth": await createMicrovmAuthToken(params),
          },
        },
      );

      if (response.ok) {
        return;
      }

      lastError = new Error(await response.text());
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Lambda MicroVM sandbox bridge did not become ready");
}

async function createMicrovmAuthToken(params: {
  client: LambdaMicrovmsClient;
  microvmId: string;
  bridgePort: number;
}) {
  const response = await params.client.send(
    new CreateMicrovmAuthTokenCommand({
      microvmIdentifier: params.microvmId,
      expirationInMinutes: DEFAULT_AUTH_TOKEN_EXPIRATION_MINUTES,
      allowedPorts: [{ port: params.bridgePort }],
    }),
  );

  const token =
    response.authToken?.["X-aws-proxy-auth"] ??
    response.authToken?.["x-aws-proxy-auth"] ??
    Object.values(response.authToken ?? {})[0];

  if (!token) {
    throw new Error(
      "Lambda MicroVM auth token response did not include X-aws-proxy-auth",
    );
  }

  return token;
}

async function getMicrovm(client: LambdaMicrovmsClient, microvmId: string) {
  try {
    return readMicrovmInfo(
      await client.send(
        new GetMicrovmCommand({ microvmIdentifier: microvmId }),
      ),
    );
  } catch (error) {
    if (isMissingMicrovmError(error)) {
      return null;
    }

    throw error;
  }
}

function getSession(
  sessions: Map<string, LambdaMicrovmSession>,
  sessionId: string,
) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Missing sandbox session: ${sessionId}`);
  }
  return session;
}

function readMicrovmInfo(value: {
  microvmId?: string;
  endpoint?: string;
  state?: string;
}) {
  if (!value.microvmId || !value.endpoint || !value.state) {
    throw new Error("Lambda MicroVM response did not include required fields");
  }

  return {
    microvmId: value.microvmId,
    endpoint: value.endpoint,
    state: value.state,
  } satisfies LambdaMicrovmInfo;
}

function normalizeEndpoint(endpoint: string) {
  const trimmed = endpoint.replace(/\/$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isMissingMicrovmError(error: unknown) {
  const parsedError = LambdaMicrovmErrorSchema.safeParse(error);
  if (!parsedError.success) {
    return false;
  }

  const { name, $metadata } = parsedError.data;
  const statusCode = $metadata?.httpStatusCode;

  return name === "ResourceNotFoundException" || statusCode === 404;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
