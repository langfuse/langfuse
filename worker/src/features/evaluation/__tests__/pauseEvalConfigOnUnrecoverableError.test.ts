import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { JobConfigState, LlmApiKeyStatus } from "@langfuse/shared";
import { pauseEvalConfigOnUnrecoverableError } from "../pauseEvalConfigOnUnrecoverableError";

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    jobExecution: {
      findFirst: vi.fn(),
    },
    jobConfiguration: {
      findFirst: vi.fn(),
    },
    evalTemplate: {
      findUnique: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    projectMembership: {
      findMany: vi.fn(),
    },
    organizationMembership: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    clearAllEvalConfigsCaches: vi.fn(),
    sendEvalPausedEmail: vi.fn(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock("../../../env", () => ({
  env: {
    NEXTAUTH_URL: "https://langfuse.example",
    EMAIL_FROM_ADDRESS: "noreply@langfuse.example",
    SMTP_CONNECTION_URL: "smtp://example",
    CLOUD_CRM_EMAIL: undefined,
  },
}));

import { prisma } from "@langfuse/shared/src/db";
import {
  clearAllEvalConfigsCaches,
  sendEvalPausedEmail,
} from "@langfuse/shared/src/server";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const projectId = "proj-1";
const jobExecutionId = "job-exec-1";
const jobConfigurationId = "job-config-1";
const templateId = "tpl-1";

function createMockTx() {
  return {
    defaultLlmModel: {
      findUnique: vi.fn(),
    },
    llmApiKeys: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    jobConfiguration: {
      update: vi.fn(),
    },
    jobExecution: {
      updateMany: vi.fn(),
    },
  };
}

describe("pauseEvalConfigOnUnrecoverableError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.project.findUnique as Mock).mockResolvedValue({ orgId: "org-1" });
    (prisma.projectMembership.findMany as Mock).mockResolvedValue([
      { user: { email: "owner@example.com" } },
    ]);
    (prisma.organizationMembership.findMany as Mock).mockResolvedValue([]);
  });

  it("returns early when no job execution is found", async () => {
    (prisma.jobExecution.findFirst as Mock).mockResolvedValue(null);

    await pauseEvalConfigOnUnrecoverableError({
      jobExecutionId,
      projectId,
      statusCode: 401,
      errorMessage: "Unauthorized",
    });

    expect(prisma.jobConfiguration.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("deactivates only the failing config, cancels pending executions, clears caches, and sends an email", async () => {
    (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
      jobConfigurationId,
      jobTemplateId: templateId,
    });
    (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue({
      id: jobConfigurationId,
      status: JobConfigState.ACTIVE,
      evalTemplate: {
        id: templateId,
        name: "Hallucination Check",
        provider: "openai",
        model: "gpt-4",
      },
    });

    let tx = createMockTx();
    (prisma.$transaction as Mock).mockImplementation(
      async (
        fn: (client: ReturnType<typeof createMockTx>) => Promise<unknown>,
      ) => {
        tx = createMockTx();
        return fn(tx);
      },
    );

    await pauseEvalConfigOnUnrecoverableError({
      jobExecutionId,
      projectId,
      statusCode: 404,
      errorMessage: "Model not found",
    });

    expect(tx.llmApiKeys.update).not.toHaveBeenCalled();
    expect(tx.jobConfiguration.update).toHaveBeenCalledWith({
      where: { id: jobConfigurationId },
      data: {
        status: JobConfigState.INACTIVE,
        statusMessage:
          "Evaluator paused: model not found (404). Update the evaluator template or the default evaluation model, then reactivate it.",
      },
    });
    expect(tx.jobExecution.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          not: jobExecutionId,
        },
        jobConfigurationId,
        projectId,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
        endTime: expect.any(Date),
      },
    });
    expect(clearAllEvalConfigsCaches).toHaveBeenCalledWith(projectId);

    // Wait for fire-and-forget notification to settle
    await flushPromises();
    expect(sendEvalPausedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: "Hallucination Check",
        pauseReasonCode: "LLM_404",
        resolutionUrl:
          "https://langfuse.example/project/proj-1/evals/templates/tpl-1",
        receiverEmail: "owner@example.com",
      }),
    );
  });

  it("uses a descriptive config message when the LLM connection is missing", async () => {
    (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
      jobConfigurationId,
      jobTemplateId: templateId,
    });
    (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue({
      id: jobConfigurationId,
      status: JobConfigState.ACTIVE,
      evalTemplate: {
        id: templateId,
        name: "Hallucination Check",
        provider: null,
        model: null,
      },
    });

    let tx = createMockTx();
    (prisma.$transaction as Mock).mockImplementation(
      async (
        fn: (client: ReturnType<typeof createMockTx>) => Promise<unknown>,
      ) => {
        tx = createMockTx();
        return fn(tx);
      },
    );

    await pauseEvalConfigOnUnrecoverableError({
      jobExecutionId,
      projectId,
      statusCode: null,
      errorMessage:
        'Invalid model configuration for job job-exec-1: API key for provider "openai" not found in project proj-1',
    });

    expect(tx.llmApiKeys.update).not.toHaveBeenCalled();
    expect(tx.jobConfiguration.update).toHaveBeenCalledWith({
      where: { id: jobConfigurationId },
      data: {
        status: JobConfigState.INACTIVE,
        statusMessage:
          "Evaluator paused: no LLM connection found for the provider used by this evaluator. Add or restore the LLM connection, then reactivate it.",
      },
    });
    expect(tx.jobExecution.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          not: jobExecutionId,
        },
        jobConfigurationId,
        projectId,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
        endTime: expect.any(Date),
      },
    });
    // Wait for fire-and-forget notification to settle
    await flushPromises();
    expect(sendEvalPausedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        pauseReasonCode: "LLM_KEY_MISSING",
      }),
    );
  });

  it("sets the key status on 401 even if the config is already inactive, and skips duplicate notifications", async () => {
    (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
      jobConfigurationId,
      jobTemplateId: templateId,
    });
    (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue({
      id: jobConfigurationId,
      status: JobConfigState.INACTIVE,
      evalTemplate: {
        id: templateId,
        name: "Hallucination Check",
        provider: null,
        model: null,
      },
    });

    let tx = createMockTx();
    (prisma.$transaction as Mock).mockImplementation(
      async (
        fn: (client: ReturnType<typeof createMockTx>) => Promise<unknown>,
      ) => {
        tx = createMockTx();
        tx.defaultLlmModel.findUnique.mockResolvedValue({ provider: "openai" });
        tx.llmApiKeys.findFirst.mockResolvedValue({ id: "key-1" });
        return fn(tx);
      },
    );

    await pauseEvalConfigOnUnrecoverableError({
      jobExecutionId,
      projectId,
      statusCode: 401,
      errorMessage: "Unauthorized",
    });

    expect(tx.llmApiKeys.update).toHaveBeenCalledWith({
      where: { id: "key-1" },
      data: {
        status: LlmApiKeyStatus.ERROR,
        statusMessage:
          "LLM API returned 401 Unauthorized. Check your LLM connection.",
      },
    });
    expect(tx.jobConfiguration.update).not.toHaveBeenCalled();
    expect(tx.jobExecution.updateMany).not.toHaveBeenCalled();
    expect(clearAllEvalConfigsCaches).not.toHaveBeenCalled();

    // Wait to confirm no fire-and-forget notification was sent
    await flushPromises();
    expect(sendEvalPausedEmail).not.toHaveBeenCalled();
  });
});
