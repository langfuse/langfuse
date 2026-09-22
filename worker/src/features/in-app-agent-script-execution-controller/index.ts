import { randomUUID } from "node:crypto";

import { prisma } from "@langfuse/shared/src/db";
import {
  executionPublicKey,
  InAppAgentScriptExecutionState,
  isTerminalScriptExecutionState,
  SDK_GATEWAY_ROUTE_PREFIX,
} from "@langfuse/shared/in-app-agent";
import {
  activateExecutionCredential,
  completeScriptExecution,
} from "@langfuse/shared/in-app-agent/server/scriptExecution";
import {
  InAppAgentRunQueue,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";

import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";
import {
  createInAppAgentSandboxProvider,
  getDefaultInAppAgentSandboxProviderType,
} from "../in-app-agent/runtime/sandbox/config";
import type { SandboxProvider } from "../in-app-agent/runtime/sandbox/types";

const LOCK_KEY = "langfuse:in-app-agent-script-execution-controller";
const LOCK_TTL_SECONDS = 60;
const SCAN_LIMIT = 50;

export class InAppAgentScriptExecutionController extends PeriodicExclusiveRunner {
  private readonly intervalMs: number;

  protected get defaultIntervalMs(): number {
    return this.intervalMs;
  }

  constructor(opts: { intervalMs?: number } = {}) {
    super({
      name: "InAppAgentScriptExecutionController",
      metricName: "in_app_agent_script_execution_controller",
      lockKey: LOCK_KEY,
      lockTtlSeconds: LOCK_TTL_SECONDS,
      onUnavailable: "fail",
    });

    this.intervalMs =
      opts.intervalMs ??
      env.LANGFUSE_IN_APP_AGENT_SCRIPT_EXECUTION_CONTROLLER_INTERVAL_MS;
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: this.intervalMs,
    });
    super.start();
  }

  protected async execute(): Promise<void> {
    await this.withLock(async () => {
      const providerType = getDefaultInAppAgentSandboxProviderType();
      if (!providerType) {
        return;
      }

      const provider = await createInAppAgentSandboxProvider(providerType);
      const executions = await prisma.inAppAgentScriptExecution.findMany({
        where: {
          state: {
            in: [
              InAppAgentScriptExecutionState.PENDING,
              InAppAgentScriptExecutionState.RUNNING,
            ],
          },
        },
        orderBy: { admittedAt: "asc" },
        take: SCAN_LIMIT,
      });

      for (const execution of executions) {
        await this.extendLockOnProgress();
        try {
          await processScriptExecution({
            execution,
            provider,
          });
        } catch (error) {
          logger.error(`${this.instanceName}: failed to process execution`, {
            executionId: execution.id,
            projectId: execution.projectId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });
  }
}

export async function processScriptExecution(params: {
  execution: {
    id: string;
    projectId: string;
    conversationId: string;
    script: string;
    scriptDigest: string;
    state: string;
    deadlineAt: Date;
    providerSessionId: string | null;
    continuationRunId: string | null;
  };
  provider: SandboxProvider;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  const execution = params.execution;

  if (isTerminalScriptExecutionState(execution.state)) {
    if (execution.continuationRunId) {
      await enqueueContinuation({
        projectId: execution.projectId,
        runId: execution.continuationRunId,
      });
    }
    return;
  }

  if (execution.deadlineAt.getTime() <= now.getTime()) {
    await finishExecution({
      projectId: execution.projectId,
      executionId: execution.id,
      state: InAppAgentScriptExecutionState.TIMED_OUT,
      errorMessage: "The script deadline elapsed",
      exitCode: 124,
    });
    return;
  }

  const sessionId = await resolveSessionId({
    execution,
    provider: params.provider,
  });
  if (!sessionId) {
    await finishExecution({
      projectId: execution.projectId,
      executionId: execution.id,
      state: InAppAgentScriptExecutionState.UNKNOWN,
      errorMessage: "Script start acknowledgement was lost",
    });
    return;
  }

  if (execution.state === InAppAgentScriptExecutionState.PENDING) {
    const started = await launchPendingExecution({
      execution,
      provider: params.provider,
      sessionId,
    });
    if (started === "unknown") {
      await finishExecution({
        projectId: execution.projectId,
        executionId: execution.id,
        state: InAppAgentScriptExecutionState.UNKNOWN,
        errorMessage: "Script start acknowledgement was lost",
      });
    }
    return;
  }

  if (!params.provider.getExecution) {
    await finishExecution({
      projectId: execution.projectId,
      executionId: execution.id,
      state: InAppAgentScriptExecutionState.UNKNOWN,
      errorMessage: "Script start acknowledgement was lost",
    });
    return;
  }

  const status = await params.provider.getExecution({
    sessionId,
    id: execution.id,
  });

  if (!status) {
    await finishExecution({
      projectId: execution.projectId,
      executionId: execution.id,
      state: InAppAgentScriptExecutionState.UNKNOWN,
      errorMessage: "Script start acknowledgement was lost",
    });
    return;
  }

  await persistSandboxStatus({
    projectId: execution.projectId,
    executionId: execution.id,
    status,
  });
}

async function launchPendingExecution(params: {
  execution: {
    id: string;
    projectId: string;
    script: string;
    scriptDigest: string;
    deadlineAt: Date;
  };
  provider: SandboxProvider;
  sessionId: string;
}): Promise<"running" | "unknown"> {
  if (!params.provider.startExecution) {
    return "unknown";
  }

  const credential = await activateExecutionCredential({
    prisma,
    projectId: params.execution.projectId,
    executionId: params.execution.id,
  });

  if (!credential) {
    return "unknown";
  }

  try {
    const status = await params.provider.startExecution({
      sessionId: params.sessionId,
      id: params.execution.id,
      script: params.execution.script,
      digest: params.execution.scriptDigest,
      deadlineAt: params.execution.deadlineAt.toISOString(),
      env: {
        LANGFUSE_HOST: getGatewayPublicUrl(),
        LANGFUSE_PUBLIC_KEY: executionPublicKey(credential.credentialId),
        LANGFUSE_SECRET_KEY: credential.token,
      },
    });
    await persistSandboxStatus({
      projectId: params.execution.projectId,
      executionId: params.execution.id,
      status,
    });
    return "running";
  } catch {
    return "unknown";
  }
}

async function persistSandboxStatus(params: {
  projectId: string;
  executionId: string;
  status: {
    state: string;
    output: string;
    exitCode: number | null;
  };
}): Promise<void> {
  if (params.status.state === InAppAgentScriptExecutionState.SUCCEEDED) {
    await finishExecution({
      projectId: params.projectId,
      executionId: params.executionId,
      state: InAppAgentScriptExecutionState.SUCCEEDED,
      output: params.status.output,
      exitCode: params.status.exitCode,
    });
    return;
  }

  if (params.status.state === InAppAgentScriptExecutionState.FAILED) {
    await finishExecution({
      projectId: params.projectId,
      executionId: params.executionId,
      state: InAppAgentScriptExecutionState.FAILED,
      output: params.status.output,
      exitCode: params.status.exitCode,
      errorMessage: "The script failed",
    });
    return;
  }

  if (params.status.state === InAppAgentScriptExecutionState.TIMED_OUT) {
    await finishExecution({
      projectId: params.projectId,
      executionId: params.executionId,
      state: InAppAgentScriptExecutionState.TIMED_OUT,
      output: params.status.output,
      exitCode: params.status.exitCode ?? 124,
      errorMessage: "The script deadline elapsed",
    });
    return;
  }

  if (params.status.state === InAppAgentScriptExecutionState.UNKNOWN) {
    await finishExecution({
      projectId: params.projectId,
      executionId: params.executionId,
      state: InAppAgentScriptExecutionState.UNKNOWN,
      output: params.status.output,
      exitCode: params.status.exitCode,
      errorMessage: "Script start acknowledgement was lost",
    });
  }
}

async function finishExecution(params: {
  projectId: string;
  executionId: string;
  state:
    | typeof InAppAgentScriptExecutionState.SUCCEEDED
    | typeof InAppAgentScriptExecutionState.FAILED
    | typeof InAppAgentScriptExecutionState.TIMED_OUT
    | typeof InAppAgentScriptExecutionState.UNKNOWN;
  output?: string;
  exitCode?: number | null;
  errorMessage?: string | null;
}): Promise<void> {
  const outcome = await completeScriptExecution({
    prisma,
    projectId: params.projectId,
    executionId: params.executionId,
    state: params.state,
    output: params.output,
    exitCode: params.exitCode,
    errorMessage: params.errorMessage,
    continuationRunId: `arun_${randomUUID().replaceAll("-", "")}`,
  });

  if ("continuationRunId" in outcome) {
    await enqueueContinuation({
      projectId: params.projectId,
      runId: outcome.continuationRunId,
    });
  }
}

async function resolveSessionId(params: {
  execution: {
    conversationId: string;
    providerSessionId: string | null;
  };
  provider: SandboxProvider;
}): Promise<string | null> {
  if (params.execution.providerSessionId) {
    return params.execution.providerSessionId;
  }

  const conversation = await prisma.inAppAgentConversation.findFirst({
    where: { id: params.execution.conversationId },
    select: { providerSessionId: true },
  });

  if (conversation?.providerSessionId) {
    return conversation.providerSessionId;
  }

  try {
    const session = await params.provider.ensureSession({
      conversationId: params.execution.conversationId,
    });
    return session.sessionId;
  } catch {
    return null;
  }
}

function getGatewayPublicUrl(): string {
  const configured = env.LANGFUSE_IN_APP_AGENT_SDK_GATEWAY_PUBLIC_URL;
  const origin = (configured ?? env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  return `${origin}${SDK_GATEWAY_ROUTE_PREFIX}`;
}

async function enqueueContinuation(params: {
  projectId: string;
  runId: string;
}): Promise<void> {
  const queue = InAppAgentRunQueue.getInstance();
  if (!queue) {
    throw new Error("In-app agent run queue is unavailable");
  }

  await queue.add(
    QueueJobs.InAppAgentRunJob,
    {
      timestamp: new Date(),
      id: randomUUID(),
      name: QueueJobs.InAppAgentRunJob,
      payload: { projectId: params.projectId, runId: params.runId },
    },
    { jobId: params.runId },
  );
}
