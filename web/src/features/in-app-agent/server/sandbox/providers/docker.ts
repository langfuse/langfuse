import { PassThrough } from "node:stream";

import type Docker from "dockerode";
import { logger } from "@langfuse/shared/src/server";

import type { SandboxFile, SandboxProvider, SandboxSession } from "../types";

type DockerExecResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

type DockerContainer = Docker.Container;

type DockerSandboxSession = {
  toolCallFiles: ReadonlyArray<SandboxFile>;
};

type DockerExecContext = {
  operation: string;
  containerId: string;
  attempt?: number;
};

const DOCKER_SANDBOX_SERVER_PORT = 5000;

export async function createDockerSandboxProvider(params: {
  image: string;
}): Promise<SandboxProvider> {
  const { default: Docker } = await import("dockerode");
  const docker = new Docker();
  const sessions = new Map<string, DockerSandboxSession>();

  const ensureSessionState = (conversationId: string) => {
    const session = sessions.get(conversationId) ?? {
      toolCallFiles: [],
    };
    sessions.set(conversationId, session);
    return session;
  };

  const getContainerByIdentifier = async (identifier: string) => {
    const container = docker.getContainer(identifier);

    try {
      return {
        container,
        inspect: await container.inspect(),
      };
    } catch (error) {
      if (isMissingDockerContainerError(error)) {
        return null;
      }

      throw error;
    }
  };

  const getContainerByConversationId = async (conversationId: string) => {
    return getContainerByIdentifier(
      getDockerSandboxContainerName(conversationId),
    );
  };

  const createContainer = async (createParams: { conversationId: string }) => {
    let container: DockerContainer;
    const containerName = getDockerSandboxContainerName(
      createParams.conversationId,
    );

    try {
      logger.debug("In-app agent docker sandbox creating container", {
        image: params.image,
        containerName,
      });
      container = await docker.createContainer({
        Image: params.image,
        name: containerName,
        WorkingDir: "/workspace",
        AttachStdout: true,
        AttachStderr: true,
        NetworkDisabled: true,
        Tty: false,
      });
    } catch (error) {
      if (isMissingDockerImageError(error)) {
        throw new Error(
          `Missing local sandbox image ${params.image}. Re-run \`bash scripts/codex/setup.sh\` or run \`pnpm turbo run build:docker-image --filter @repo/in-app-agent-sandbox-runtime --force\`.`,
        );
      }

      throw error;
    }

    logger.debug("In-app agent docker sandbox starting container", {
      containerId: container.id,
      conversationId: createParams.conversationId,
    });
    await container.start();
    logger.debug("In-app agent docker sandbox started container", {
      containerId: container.id,
      conversationId: createParams.conversationId,
    });

    ensureSessionState(createParams.conversationId);
    await waitForSandboxServer(container);
    return container;
  };

  const ensureContainer = async (params: { conversationId: string }) => {
    logger.debug("In-app agent docker sandbox inspecting existing container", {
      conversationId: params.conversationId,
      containerName: getDockerSandboxContainerName(params.conversationId),
    });

    const existing = await getContainerByConversationId(params.conversationId);
    if (!existing) {
      logger.debug("In-app agent docker sandbox missing container", {
        conversationId: params.conversationId,
      });
      return createContainer(params);
    }

    if (!existing.inspect.State?.Running) {
      logger.debug("In-app agent docker sandbox removing stale container", {
        conversationId: params.conversationId,
        containerId: existing.container.id,
        state: formatContainerState(existing.inspect),
      });
      await existing.container
        .remove({ force: true, v: true })
        .catch(() => undefined);
      return createContainer(params);
    }

    ensureSessionState(params.conversationId);
    logger.debug("In-app agent docker sandbox reusing running container", {
      conversationId: params.conversationId,
      containerId: existing.container.id,
      state: formatContainerState(existing.inspect),
    });
    return existing.container;
  };

  const createSessionSandbox = (conversationId: string): SandboxSession => ({
    async syncReadonlyFiles({ files }) {
      ensureSessionState(conversationId).toolCallFiles = files;
      logger.debug("In-app agent docker sandbox synced readonly files", {
        conversationId,
        fileCount: files.length,
        paths: files.map((file) => file.path),
      });
    },
    async read({ path }) {
      const container = await ensureContainer({ conversationId });
      return callSandboxServer(container, {
        operation: "read",
        path,
        toolCallFiles: getSession(sessions, conversationId).toolCallFiles,
      });
    },
    async write({ path, content }) {
      const container = await ensureContainer({ conversationId });
      return callSandboxServer(container, {
        operation: "write",
        path,
        content,
        toolCallFiles: getSession(sessions, conversationId).toolCallFiles,
      });
    },
    async edit({ path, oldText, newText }) {
      const container = await ensureContainer({ conversationId });
      return callSandboxServer(container, {
        operation: "edit",
        path,
        oldText,
        newText,
        toolCallFiles: getSession(sessions, conversationId).toolCallFiles,
      });
    },
    async bash({ command, timeoutMs }) {
      const container = await ensureContainer({ conversationId });
      return callSandboxServer(container, {
        operation: "bash",
        command,
        ...(timeoutMs ? { timeoutMs } : {}),
        toolCallFiles: getSession(sessions, conversationId).toolCallFiles,
      });
    },
  });

  return {
    async ensureSession({ conversationId, sessionId }) {
      logger.debug("In-app agent docker sandbox ensureSession", {
        conversationId,
        requestedSessionId: sessionId,
      });
      const container = await ensureContainer({
        conversationId,
      });
      logger.debug("In-app agent docker sandbox ready session", {
        conversationId,
        sessionId: container.id,
      });
      return {
        sessionId: conversationId,
        sandbox: createSessionSandbox(conversationId),
      };
    },
    async suspendSession({ sessionId }) {
      sessions.delete(sessionId);
      logger.debug(
        "In-app agent docker sandbox leaving container running across local session suspend",
        {
          sessionId,
        },
      );
    },
    async terminateSession({ sessionId }: { sessionId: string }) {
      sessions.delete(sessionId);
      const existing =
        (await getContainerByIdentifier(sessionId)) ??
        (await getContainerByConversationId(sessionId));

      await existing?.container
        .remove({ force: true, v: true })
        .catch(() => undefined);
    },
  };
}

async function waitForSandboxServer(container: DockerContainer) {
  const startedAt = Date.now();
  let lastError: unknown;
  let attempt = 0;

  while (Date.now() - startedAt < 30_000) {
    attempt += 1;
    try {
      logger.debug("In-app agent docker sandbox health probe start", {
        containerId: container.id,
        attempt,
        elapsedMs: Date.now() - startedAt,
      });
      const result = await execJsonInContainer(container, [
        "node",
        "-e",
        `
          (async () => {
            const response = await fetch("http://127.0.0.1:${DOCKER_SANDBOX_SERVER_PORT}/health");
            if (!response.ok) {
              process.stderr.write(await response.text());
              process.exit(1);
            }
            process.stdout.write(await response.text());
          })().catch((error) => {
            process.stderr.write(error instanceof Error ? error.message : String(error));
            process.exit(1);
          });
        `,
      ]);

      logger.debug("In-app agent docker sandbox health probe result", {
        containerId: container.id,
        attempt,
        result,
      });

      if (
        result &&
        typeof result === "object" &&
        "status" in result &&
        result.status === "ok"
      ) {
        logger.debug("In-app agent docker sandbox health probe ready", {
          containerId: container.id,
          attempt,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }
    } catch (error) {
      lastError = error;
      logger.debug("In-app agent docker sandbox health probe failed", {
        containerId: container.id,
        attempt,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw await createSandboxServerNotReadyError({ container, lastError });
}

async function createSandboxServerNotReadyError(params: {
  container: DockerContainer;
  lastError: unknown;
}) {
  const details = ["Sandbox server did not become ready within 30000ms."];

  if (params.lastError instanceof Error) {
    details.push(`Last health probe error: ${params.lastError.message}`);
  }

  const inspect = await params.container.inspect().catch(() => null);
  if (inspect) {
    details.push(`Container state: ${formatContainerState(inspect)}`);
  }

  const logs = await readContainerLogs(params.container).catch(() => null);
  if (logs) {
    details.push(`Container logs: ${logs}`);
  }

  return new Error(details.join(" "));
}

async function callSandboxServer(
  container: DockerContainer,
  payload: Record<string, unknown>,
) {
  logger.debug("In-app agent docker sandbox tool call start", {
    containerId: container.id,
    payload: summarizePayload(payload),
  });
  const result = await execJsonInContainer(
    container,
    [
      "node",
      "-e",
      `
      (async () => {
        const payload = JSON.parse(process.argv[1]);
        const response = await fetch("http://127.0.0.1:${DOCKER_SANDBOX_SERVER_PORT}/sandbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await response.text();
        if (!response.ok) {
          process.stderr.write(text);
          process.exit(1);
        }
        process.stdout.write(text);
      })().catch((error) => {
        process.stderr.write(error instanceof Error ? error.message : String(error));
        process.exit(1);
      });
    `,
      JSON.stringify(payload),
    ],
    undefined,
    {
      operation: `sandbox:${String(payload.operation ?? "unknown")}`,
      containerId: container.id,
    },
  );

  logger.debug("In-app agent docker sandbox tool call result", {
    containerId: container.id,
    payload: summarizePayload(payload),
    result,
  });

  if (result && typeof result === "object" && "result" in result) {
    return result.result;
  }

  return result;
}

function getSession(
  sessions: Map<string, DockerSandboxSession>,
  sessionId: string,
) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Missing sandbox session: ${sessionId}`);
  }

  return session;
}

async function execJsonInContainer(
  container: DockerContainer,
  cmd: string[],
  timeoutMs?: number,
  context?: DockerExecContext,
) {
  const result = await execInContainer(container, cmd, timeoutMs, context);
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr || result.stdout || "Container command failed",
    );
  }
  return JSON.parse(result.stdout || "null") as unknown;
}

async function execInContainer(
  container: DockerContainer,
  cmd: string[],
  timeoutMs?: number,
  context?: DockerExecContext,
): Promise<DockerExecResult> {
  logger.debug("In-app agent docker sandbox exec create", {
    containerId: container.id,
    operation: context?.operation ?? "unknown",
    attempt: context?.attempt,
    timeoutMs: timeoutMs ?? null,
    commandPreview: summarizeCommand(cmd),
  });
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: "/workspace",
  });
  logger.debug("In-app agent docker sandbox exec created", {
    containerId: container.id,
    operation: context?.operation ?? "unknown",
    attempt: context?.attempt,
  });
  const stream = await exec.start({ Tty: false });
  logger.debug("In-app agent docker sandbox exec stream started", {
    containerId: container.id,
    operation: context?.operation ?? "unknown",
    attempt: context?.attempt,
  });

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  container.modem.demuxStream(stream, stdout, stderr);
  const finalizeDemuxStreams = () => {
    stdout.end();
    stderr.end();
  };
  stream.once("end", () => {
    logger.debug("In-app agent docker sandbox exec stream end", {
      containerId: container.id,
      operation: context?.operation ?? "unknown",
      attempt: context?.attempt,
    });
    finalizeDemuxStreams();
  });
  stream.once("close", () => {
    logger.debug("In-app agent docker sandbox exec stream close", {
      containerId: container.id,
      operation: context?.operation ?? "unknown",
      attempt: context?.attempt,
    });
    finalizeDemuxStreams();
  });
  stream.once("error", (error) => {
    logger.debug("In-app agent docker sandbox exec stream error", {
      containerId: container.id,
      operation: context?.operation ?? "unknown",
      attempt: context?.attempt,
      error: error instanceof Error ? error.message : String(error),
    });
    finalizeDemuxStreams();
  });

  const timeoutId = timeoutMs
    ? setTimeout(
        () =>
          stream.destroy(
            new Error(`Sandbox command timed out after ${timeoutMs}ms`),
          ),
        timeoutMs,
      )
    : undefined;

  try {
    const [stdoutBytes, stderrBytes, inspect] = await Promise.all([
      readStreamToUint8Array(stdout).then((bytes) => {
        logger.debug("In-app agent docker sandbox exec stdout complete", {
          containerId: container.id,
          operation: context?.operation ?? "unknown",
          attempt: context?.attempt,
          bytes: bytes.length,
        });
        return bytes;
      }),
      readStreamToUint8Array(stderr).then((bytes) => {
        logger.debug("In-app agent docker sandbox exec stderr complete", {
          containerId: container.id,
          operation: context?.operation ?? "unknown",
          attempt: context?.attempt,
          bytes: bytes.length,
        });
        return bytes;
      }),
      waitForStreamEnd(stream).then(async () => {
        logger.debug("In-app agent docker sandbox exec inspect start", {
          containerId: container.id,
          operation: context?.operation ?? "unknown",
          attempt: context?.attempt,
        });
        const inspect = await exec.inspect();
        logger.debug("In-app agent docker sandbox exec inspect complete", {
          containerId: container.id,
          operation: context?.operation ?? "unknown",
          attempt: context?.attempt,
          exitCode: inspect.ExitCode ?? 1,
        });
        return inspect;
      }),
    ]);

    const stdoutText = Buffer.from(stdoutBytes).toString("utf8");
    const stderrText = Buffer.from(stderrBytes).toString("utf8");
    logger.debug("In-app agent docker sandbox exec complete", {
      containerId: container.id,
      operation: context?.operation ?? "unknown",
      attempt: context?.attempt,
      exitCode: inspect.ExitCode ?? 1,
      stdoutPreview: summarizeText(stdoutText),
      stderrPreview: summarizeText(stderrText),
    });

    return {
      exitCode: inspect.ExitCode ?? 1,
      stdout: stdoutText,
      stderr: stderrText,
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function summarizePayload(payload: Record<string, unknown>) {
  if (payload.operation === "read") {
    return {
      operation: payload.operation,
      path: payload.path,
      toolCallFileCount: Array.isArray(payload.toolCallFiles)
        ? payload.toolCallFiles.length
        : 0,
    };
  }

  if (payload.operation === "write") {
    return {
      operation: payload.operation,
      path: payload.path,
      contentBytes:
        typeof payload.content === "string"
          ? Buffer.byteLength(payload.content, "utf8")
          : null,
      toolCallFileCount: Array.isArray(payload.toolCallFiles)
        ? payload.toolCallFiles.length
        : 0,
    };
  }

  if (payload.operation === "edit") {
    return {
      operation: payload.operation,
      path: payload.path,
      oldTextLength:
        typeof payload.oldText === "string" ? payload.oldText.length : null,
      newTextLength:
        typeof payload.newText === "string" ? payload.newText.length : null,
      toolCallFileCount: Array.isArray(payload.toolCallFiles)
        ? payload.toolCallFiles.length
        : 0,
    };
  }

  if (payload.operation === "bash") {
    return {
      operation: payload.operation,
      timeoutMs: payload.timeoutMs,
      command:
        typeof payload.command === "string"
          ? summarizeText(payload.command)
          : null,
      toolCallFileCount: Array.isArray(payload.toolCallFiles)
        ? payload.toolCallFiles.length
        : 0,
    };
  }

  return payload;
}

function summarizeCommand(cmd: string[]) {
  return summarizeText(cmd.join(" "));
}

function summarizeText(text: string, maxLength = 500) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

async function readStreamToUint8Array(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function waitForStreamEnd(stream: NodeJS.ReadableStream) {
  await new Promise<void>((resolve, reject) => {
    stream.once("end", resolve);
    stream.once("error", reject);
    stream.once("close", resolve);
  });
}

async function readContainerLogs(container: DockerContainer) {
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail: 50,
  });

  const content = Buffer.isBuffer(logs)
    ? logs.toString("utf8")
    : Buffer.from(await readStreamToUint8Array(logs)).toString("utf8");
  const trimmed = content.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.split(/\r?\n/).slice(-10).join(" | ");
}

function formatContainerState(
  inspect: Awaited<ReturnType<DockerContainer["inspect"]>>,
) {
  const state = inspect.State;
  if (!state) {
    return "state unavailable";
  }

  return [
    `status=${state.Status ?? "unknown"}`,
    `running=${String(state.Running ?? false)}`,
    `exitCode=${String(state.ExitCode ?? "unknown")}`,
    ...(state.Error ? [`error=${state.Error}`] : []),
  ].join(", ");
}

function isMissingDockerImageError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "statusCode" in error &&
    error.statusCode === 404 &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("No such image")
  );
}

function isMissingDockerContainerError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "statusCode" in error &&
    error.statusCode === 404 &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.toLowerCase().includes("no such container")
  );
}

function getDockerSandboxContainerName(conversationId: string) {
  const sanitizedConversationId = conversationId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `langfuse-in-app-agent-sandbox-${sanitizedConversationId || "unknown"}`;
}
