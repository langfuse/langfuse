import { randomUUID } from "crypto";

import {
  CreateMicrovmAuthTokenCommand,
  GetMicrovmCommand,
  LambdaMicrovmsClient,
  ResumeMicrovmCommand,
  RunMicrovmCommand,
  SuspendMicrovmCommand,
  TerminateMicrovmCommand,
  type RunMicrovmCommandInput,
} from "@aws-sdk/client-lambda-microvms";
import { logger } from "@langfuse/shared/src/server";
import { z } from "zod";

import type { SandboxFile, SandboxProvider, SandboxSession } from "../types";

const DEFAULT_AUTH_TOKEN_EXPIRATION_MINUTES = 30;
const AUTH_TOKEN_REFRESH_BUFFER_MS = 60_000;
const DEFAULT_SANDBOX_SERVER_PORT = 5000;
const DEFAULT_SUSPEND_AFTER_IDLE_SECONDS = 60;
const DEFAULT_TERMINATE_AFTER_SUSPEND_SECONDS = 8 * 60 * 60;
const DEFAULT_MAXIMUM_DURATION_SECONDS = 3_600;
const BRIDGE_READY_TIMEOUT_MS = 30_000;

const LambdaMicrovmErrorSchema = z.object({
  name: z.string().optional(),
  $metadata: z
    .object({
      httpStatusCode: z.number().optional(),
    })
    .optional(),
});

const LambdaMicrovmOperationResultSchema = z.object({
  result: z.unknown(),
});

type LambdaMicrovmOperation =
  | { operation: "read"; path: string }
  | { operation: "write"; path: string; content: string }
  | { operation: "edit"; path: string; oldText: string; newText: string }
  | { operation: "bash"; command: string; timeoutMs?: number };

type LambdaMicrovmSession = {
  endpoint: string;
  authToken?: {
    value: string;
    expiresAtMs: number;
  };
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
  executionRoleArn: string;
  egressNetworkConnectorArn?: string;
  region: string;
}): SandboxProvider {
  const client = new LambdaMicrovmsClient({
    region: params.region,
  });
  const sessions = new Map<string, LambdaMicrovmSession>();

  const ensureSession = async (request: {
    conversationId: string;
    sessionId?: string | null;
  }) => {
    logger.debug("[Lambda MicroVM Sandbox] ensureSession", {
      conversationId: request.conversationId,
      requestedSessionId: request.sessionId,
    });

    if (request.sessionId) {
      logger.debug(
        "[Lambda MicroVM Sandbox] checking existing session before restore",
        {
          conversationId: request.conversationId,
          sessionId: request.sessionId,
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
          });
          await client.send(
            new ResumeMicrovmCommand({ microvmIdentifier: request.sessionId }),
          );
        }

        await waitForBridge({
          client,
          microvmId: request.sessionId,
          endpoint: existing.endpoint,
        });

        const session = sessions.get(request.sessionId);
        sessions.set(request.sessionId, {
          ...session,
          endpoint: existing.endpoint,
          toolCallFiles: session?.toolCallFiles ?? [],
        });
        logger.debug("[Lambda MicroVM Sandbox] reusing existing session", {
          conversationId: request.conversationId,
          sessionId: request.sessionId,
          state: existing.state,
        });
        return { sessionId: request.sessionId, endpoint: existing.endpoint };
      }

      logger.debug("[Lambda MicroVM Sandbox] existing session not found", {
        conversationId: request.conversationId,
        sessionId: request.sessionId,
      });
      sessions.delete(request.sessionId);
    }

    logger.debug("[Lambda MicroVM Sandbox] creating new session", {
      conversationId: request.conversationId,
      imageIdentifier: params.imageIdentifier,
      hasExecutionRoleArn: Boolean(params.executionRoleArn),
    });
    const microvm = readMicrovmInfo(
      await client.send(
        new RunMicrovmCommand({
          imageIdentifier: params.imageIdentifier,
          executionRoleArn: params.executionRoleArn,
          ...(params.egressNetworkConnectorArn
            ? { egressNetworkConnectors: [params.egressNetworkConnectorArn] }
            : {}),
          idlePolicy: {
            autoResumeEnabled: true,
            maxIdleDurationSeconds: DEFAULT_SUSPEND_AFTER_IDLE_SECONDS,
            suspendedDurationSeconds: DEFAULT_TERMINATE_AFTER_SUSPEND_SECONDS,
          },
          maximumDurationInSeconds: DEFAULT_MAXIMUM_DURATION_SECONDS,
          clientToken: randomUUID(),
        } satisfies RunMicrovmCommandInput),
      ),
    );

    sessions.set(microvm.microvmId, {
      endpoint: microvm.endpoint,
      toolCallFiles: [],
    });
    await waitForBridge({
      client,
      microvmId: microvm.microvmId,
      endpoint: microvm.endpoint,
    });

    logger.debug("[Lambda MicroVM Sandbox] created new session", {
      conversationId: request.conversationId,
      sessionId: microvm.microvmId,
      state: microvm.state,
    });

    return { sessionId: microvm.microvmId, endpoint: microvm.endpoint };
  };

  const executeOperation = async (
    sessionId: string,
    operation: LambdaMicrovmOperation,
  ) => {
    const session = getSession(sessions, sessionId);
    if (
      !session.authToken ||
      session.authToken.expiresAtMs - AUTH_TOKEN_REFRESH_BUFFER_MS <= Date.now()
    ) {
      session.authToken = await createMicrovmAuthToken({
        client,
        microvmId: sessionId,
        endpoint: session.endpoint,
      });
    }

    logger.debug("[Lambda MicroVM Sandbox] executing operation", {
      sessionId,
      operation: operation.operation,
      endpoint: session.endpoint,
      normalizedEndpoint: normalizeEndpoint(session.endpoint),
      endpointPort: getEndpointPort(session.endpoint),
      sandboxServerPort: DEFAULT_SANDBOX_SERVER_PORT,
    });

    const response = await fetch(
      `${normalizeEndpoint(session.endpoint)}/sandbox`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-aws-proxy-port": String(DEFAULT_SANDBOX_SERVER_PORT),
          "X-aws-proxy-auth": session.authToken.value,
        },
        body: JSON.stringify({
          ...operation,
          toolCallFiles: session.toolCallFiles,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.debug("[Lambda MicroVM Sandbox] operation request failed", {
        sessionId,
        operation: operation.operation,
        endpoint: session.endpoint,
        normalizedEndpoint: normalizeEndpoint(session.endpoint),
        endpointPort: getEndpointPort(session.endpoint),
        sandboxServerPort: DEFAULT_SANDBOX_SERVER_PORT,
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(
        errorText || `Lambda MicroVM bridge request failed: ${response.status}`,
      );
    }

    const result = (await response.json()) as unknown;
    const parsedResult = LambdaMicrovmOperationResultSchema.safeParse(result);
    if (parsedResult.success) {
      return parsedResult.data.result;
    }

    return result;
  };

  const createSessionSandbox = (sessionId: string): SandboxSession => ({
    async syncReadonlyFiles({ files }) {
      getSession(sessions, sessionId).toolCallFiles = files;
    },
    async read({ path }) {
      return executeOperation(sessionId, { operation: "read", path });
    },
    async write({ path, content }) {
      return executeOperation(sessionId, {
        operation: "write",
        path,
        content,
      });
    },
    async edit({ path, oldText, newText }) {
      return executeOperation(sessionId, {
        operation: "edit",
        path,
        oldText,
        newText,
      });
    },
    async bash({ command, timeoutMs }) {
      return executeOperation(sessionId, {
        operation: "bash",
        command,
        ...(timeoutMs ? { timeoutMs } : {}),
      });
    },
  });

  return {
    async ensureSession({ conversationId, sessionId }) {
      const session = await ensureSession({
        conversationId,
        sessionId,
      });
      return {
        sessionId: session.sessionId,
        sandbox: createSessionSandbox(session.sessionId),
      };
    },
    async suspendSession({ sessionId }) {
      try {
        await client.send(
          new SuspendMicrovmCommand({ microvmIdentifier: sessionId }),
        );
        logger.debug("[Lambda MicroVM Sandbox] suspended session", {
          sessionId,
        });
      } catch (error) {
        if (!isMissingMicrovmError(error)) {
          throw error;
        }

        logger.debug(
          "[Lambda MicroVM Sandbox] suspend skipped missing session",
          {
            sessionId,
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
          new TerminateMicrovmCommand({ microvmIdentifier: sessionId }),
        );
        logger.debug("[Lambda MicroVM Sandbox] terminated session", {
          sessionId,
        });
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
      logger.debug("[Lambda MicroVM Sandbox] bridge health probe", {
        microvmId: params.microvmId,
        endpoint: params.endpoint,
        normalizedEndpoint: normalizeEndpoint(params.endpoint),
        endpointPort: getEndpointPort(params.endpoint),
        sandboxServerPort: DEFAULT_SANDBOX_SERVER_PORT,
      });
      const response = await fetch(
        `${normalizeEndpoint(params.endpoint)}/health`,
        {
          headers: {
            "X-aws-proxy-port": String(DEFAULT_SANDBOX_SERVER_PORT),
            "X-aws-proxy-auth": (await createMicrovmAuthToken(params)).value,
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
  endpoint: string;
}) {
  const endpointPort = getEndpointPort(params.endpoint);
  logger.debug("[Lambda MicroVM Sandbox] creating auth token", {
    microvmId: params.microvmId,
    endpoint: params.endpoint,
    normalizedEndpoint: normalizeEndpoint(params.endpoint),
    endpointPort,
    sandboxServerPort: DEFAULT_SANDBOX_SERVER_PORT,
  });

  const response = await params.client.send(
    new CreateMicrovmAuthTokenCommand({
      microvmIdentifier: params.microvmId,
      expirationInMinutes: DEFAULT_AUTH_TOKEN_EXPIRATION_MINUTES,
      allowedPorts: [{ allPorts: {} }],
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

  logger.debug("[Lambda MicroVM Sandbox] created auth token", {
    microvmId: params.microvmId,
    endpointPort,
    sandboxServerPort: DEFAULT_SANDBOX_SERVER_PORT,
    authTokenKeys: Object.keys(response.authToken ?? {}),
  });

  return {
    value: token,
    expiresAtMs: Date.now() + DEFAULT_AUTH_TOKEN_EXPIRATION_MINUTES * 60 * 1000,
  };
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

function getEndpointPort(endpoint: string) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const parsedEndpoint = new URL(normalizedEndpoint);

  if (parsedEndpoint.port) {
    return Number(parsedEndpoint.port);
  }

  return parsedEndpoint.protocol === "http:" ? 80 : 443;
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
