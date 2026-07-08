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
import { logger } from "@langfuse/shared/src/server";
import { z } from "zod";

import type { SandboxFile, SandboxProvider, SandboxSession } from "../types";

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
  stateReason?: string;
};

export function createLambdaMicrovmSandboxProvider(params: {
  imageIdentifier: string;
  executionRoleArn?: string;
  bridgePort?: number;
  snapshotConfig: {
    bucket?: string;
    prefix?: string;
    region?: string;
  };
}): SandboxProvider {
  const client = new LambdaMicrovmsClient({});
  const sessions = new Map<string, LambdaMicrovmSession>();
  const bridgePort = params.bridgePort ?? DEFAULT_BRIDGE_PORT;

  const ensureSession = async (request: {
    conversationId: string;
    sessionId?: string | null;
    snapshotKey: string;
  }) => {
    logger.debug("[Lambda MicroVM Sandbox] ensureSession", {
      conversationId: request.conversationId,
      requestedSessionId: request.sessionId,
      snapshotKey: request.snapshotKey,
    });

    if (request.sessionId) {
      logger.debug(
        "[Lambda MicroVM Sandbox] checking existing session before restore",
        {
          conversationId: request.conversationId,
          sessionId: request.sessionId,
          snapshotKey: request.snapshotKey,
        },
      );
    }

    if (request.sessionId) {
      const existing = await getMicrovm(client, request.sessionId);
      if (existing) {
        if (existing.state === "SUSPENDED") {
          logger.debug("[Lambda MicroVM Sandbox] resuming suspended session", {
            conversationId: request.conversationId,
            sessionId: request.sessionId,
            snapshotKey: request.snapshotKey,
          });
          await client.send(
            new ResumeMicrovmCommand({ microvmIdentifier: request.sessionId }),
          );
        }

        await waitForBridge({
          client,
          microvmId: request.sessionId,
          endpoint: existing.endpoint,
          bridgePort,
        });

        sessions.set(
          request.sessionId,
          sessions.get(request.sessionId) ?? { toolCallFiles: [] },
        );
        logger.debug("[Lambda MicroVM Sandbox] reusing existing session", {
          conversationId: request.conversationId,
          sessionId: request.sessionId,
          snapshotKey: request.snapshotKey,
          state: existing.state,
        });
        return { sessionId: request.sessionId, endpoint: existing.endpoint };
      }

      logger.debug("[Lambda MicroVM Sandbox] existing session not found", {
        conversationId: request.conversationId,
        sessionId: request.sessionId,
        snapshotKey: request.snapshotKey,
      });
      sessions.delete(request.sessionId);
    }

    logger.debug("[Lambda MicroVM Sandbox] creating new session", {
      conversationId: request.conversationId,
      snapshotKey: request.snapshotKey,
      imageIdentifier: params.imageIdentifier,
      hasExecutionRoleArn: Boolean(params.executionRoleArn),
    });
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
          runHookPayload: JSON.stringify({
            bridgePort,
            snapshotBucket: params.snapshotConfig.bucket,
            snapshotKey: request.snapshotKey,
            snapshotPrefix: params.snapshotConfig.prefix,
            snapshotRegion: params.snapshotConfig.region,
          }),
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

    logger.debug("[Lambda MicroVM Sandbox] created new session", {
      conversationId: request.conversationId,
      sessionId: microvm.microvmId,
      snapshotKey: request.snapshotKey,
      state: microvm.state,
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
    async ensureSession({ conversationId, sessionId, snapshotKey }) {
      const session = await ensureSession({
        conversationId,
        sessionId,
        snapshotKey,
      });
      return {
        sessionId: session.sessionId,
        sandbox: createSessionSandbox(session.sessionId),
      };
    },
    async suspendSession({ sessionId, snapshotKey }) {
      try {
        await client.send(
          new SuspendMicrovmCommand({ microvmIdentifier: sessionId }),
        );
        logger.debug("[Lambda MicroVM Sandbox] suspended session", {
          sessionId,
          snapshotKey,
        });
      } catch (error) {
        if (!isMissingMicrovmError(error)) {
          throw error;
        }

        logger.debug(
          "[Lambda MicroVM Sandbox] suspend skipped missing session",
          {
            sessionId,
            snapshotKey,
          },
        );
      } finally {
        sessions.delete(sessionId);
      }
    },
    async terminateSession({ sessionId }) {
      logger.debug("[Lambda MicroVM Sandbox] terminating session", {
        sessionId,
      });
      sessions.delete(sessionId);

      try {
        await client.send(
          new SuspendMicrovmCommand({ microvmIdentifier: sessionId }),
        );
        logger.debug(
          "[Lambda MicroVM Sandbox] terminated session via suspend",
          {
            sessionId,
          },
        );
      } catch (error) {
        if (!isMissingMicrovmError(error)) {
          throw error;
        }

        logger.debug(
          "[Lambda MicroVM Sandbox] terminate skipped missing session",
          {
            sessionId,
          },
        );
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
    const microvm = await getMicrovm(params.client, params.microvmId);
    if (!microvm) {
      throw new Error(
        `[Lambda MicroVM Sandbox] startup failed before bridge became ready: session ${params.microvmId} no longer exists`,
      );
    }

    if (microvm.state === "TERMINATING" || microvm.state === "TERMINATED") {
      throw new Error(
        `[Lambda MicroVM Sandbox] startup failed before bridge became ready: state=${microvm.state}${microvm.stateReason ? ` stateReason=${microvm.stateReason}` : ""}`,
      );
    }

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

      lastError = new Error(
        (await response.text()) ||
          `[Lambda MicroVM Sandbox] health probe failed with ${response.status}`,
      );
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("[Lambda MicroVM Sandbox] bridge did not become ready");
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
  stateReason?: string;
}) {
  if (!value.microvmId || !value.endpoint || !value.state) {
    throw new Error("Lambda MicroVM response did not include required fields");
  }

  return {
    microvmId: value.microvmId,
    endpoint: value.endpoint,
    state: value.state,
    ...(value.stateReason ? { stateReason: value.stateReason } : {}),
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
