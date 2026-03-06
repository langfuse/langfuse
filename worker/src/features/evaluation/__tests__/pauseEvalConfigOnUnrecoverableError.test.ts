import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  JobConfigState,
  JobConfigSuspendCode,
  LlmApiKeyStatus,
} from "@langfuse/shared";
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
    $transaction: vi.fn(),
  },
}));

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    clearAllEvalConfigsCaches: vi.fn(),
    getProjectOwnerEmails: vi.fn(),
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
  getProjectOwnerEmails,
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
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    jobExecution: {
      updateMany: vi.fn(),
    },
  };
}

describe("pauseEvalConfigOnUnrecoverableError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getProjectOwnerEmails as Mock).mockResolvedValue(["owner@example.com"]);
  });

  it("returns early when no job execution is found", async () => {
    (prisma.jobExecution.findFirst as Mock).mockResolvedValue(null);

    await pauseEvalConfigOnUnrecoverableError({
      jobExecutionId,
      projectId,
      suspendCode: JobConfigSuspendCode.LLM_401,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("suspends the config on 404, cancels pending executions, clears caches, and sends an email", async () => {
    (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
      jobConfigurationId,
      jobTemplateId: templateId,
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

    // After transaction, the function fetches config + template for email
    (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue({
      id: jobConfigurationId,
      evalTemplate: {
        id: templateId,
        name: "Hallucination Check",
        provider: "openai",
        model: "gpt-4",
      },
    });

    await pauseEvalConfigOnUnrecoverableError({
      jobExecutionId,
      projectId,
      suspendCode: JobConfigSuspendCode.LLM_404,
    });

    expect(tx.llmApiKeys.update).not.toHaveBeenCalled();
    expect(tx.jobConfiguration.updateMany).toHaveBeenCalledWith({
      where: {
        id: jobConfigurationId,
        projectId,
        status: JobConfigState.ACTIVE,
      },
      data: {
        status: JobConfigState.SUSPENDED,
        statusMessage:
          "Evaluator suspended: model not found (404). Update the evaluator template or the default evaluation model, then reactivate it.",
        suspendCode: JobConfigSuspendCode.LLM_404,
        suspendedAt: expect.any(Date),
      },
    });
    expect(tx.jobExecution.updateMany).toHaveBeenCalledWith({
      where: {
        id: { not: jobExecutionId },
        jobConfigurationId,
        projectId,
        status: {
          in: ["PENDING", "DELAYED"],
        },
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

  it("suspends the config with LLM_KEY_MISSING code and sends email", async () => {
    (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
      jobConfigurationId,
      jobTemplateId: templateId,
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

    (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue({
      id: jobConfigurationId,
      evalTemplate: {
        id: templateId,
        name: "Hallucination Check",
        provider: null,
        model: null,
      },
    });

    await pauseEvalConfigOnUnrecoverableError({
      jobExecutionId,
      projectId,
      suspendCode: JobConfigSuspendCode.LLM_KEY_MISSING,
    });

    expect(tx.llmApiKeys.update).not.toHaveBeenCalled();
    expect(tx.jobConfiguration.updateMany).toHaveBeenCalledWith({
      where: {
        id: jobConfigurationId,
        projectId,
        status: JobConfigState.ACTIVE,
      },
      data: {
        status: JobConfigState.SUSPENDED,
        statusMessage:
          "Evaluator suspended: no LLM connection found for the provider used by this evaluator. Add or restore the LLM connection, then reactivate it.",
        suspendCode: JobConfigSuspendCode.LLM_KEY_MISSING,
        suspendedAt: expect.any(Date),
      },
    });

    await flushPromises();
    expect(sendEvalPausedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        pauseReasonCode: "LLM_KEY_MISSING",
        resolutionUrl:
          "https://langfuse.example/project/proj-1/settings/llm-connections",
      }),
    );
  });

  it("skips suspension when config is already not ACTIVE (race condition), and does not notify", async () => {
    (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
      jobConfigurationId,
      jobTemplateId: templateId,
    });

    let tx = createMockTx();
    (prisma.$transaction as Mock).mockImplementation(
      async (
        fn: (client: ReturnType<typeof createMockTx>) => Promise<unknown>,
      ) => {
        tx = createMockTx();
        // Atomic updateMany returns count: 0 — already suspended
        tx.jobConfiguration.updateMany.mockResolvedValue({ count: 0 });
        return fn(tx);
      },
    );

    await pauseEvalConfigOnUnrecoverableError({
      jobExecutionId,
      projectId,
      suspendCode: JobConfigSuspendCode.LLM_401,
    });

    expect(tx.jobExecution.updateMany).not.toHaveBeenCalled();
    expect(tx.llmApiKeys.update).not.toHaveBeenCalled();
    expect(clearAllEvalConfigsCaches).not.toHaveBeenCalled();

    await flushPromises();
    expect(sendEvalPausedEmail).not.toHaveBeenCalled();
  });

  it("debounces notifications if evaluator was suspended recently", async () => {
    (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
      jobConfigurationId,
      jobTemplateId: templateId,
    });

    let tx = createMockTx();
    (prisma.$transaction as Mock).mockImplementation(
      async (
        fn: (client: ReturnType<typeof createMockTx>) => Promise<unknown>,
      ) => {
        tx = createMockTx();
        tx.jobConfiguration.findFirst.mockResolvedValue({
          suspendedAt: new Date(Date.now() - 15 * 60 * 1000),
          evalTemplate: { provider: null },
        });
        return fn(tx);
      },
    );

    await pauseEvalConfigOnUnrecoverableError({
      jobExecutionId,
      projectId,
      suspendCode: JobConfigSuspendCode.LLM_401,
    });

    expect(clearAllEvalConfigsCaches).toHaveBeenCalledWith(projectId);
    await flushPromises();
    expect(sendEvalPausedEmail).not.toHaveBeenCalled();
  });

  it("marks the API key as errored on 401 when first to suspend", async () => {
    (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
      jobConfigurationId,
      jobTemplateId: templateId,
    });

    let tx = createMockTx();
    (prisma.$transaction as Mock).mockImplementation(
      async (
        fn: (client: ReturnType<typeof createMockTx>) => Promise<unknown>,
      ) => {
        tx = createMockTx();
        tx.jobConfiguration.findFirst.mockResolvedValue({
          id: jobConfigurationId,
          evalTemplate: { provider: null },
        });
        tx.defaultLlmModel.findUnique.mockResolvedValue({
          provider: "openai",
        });
        tx.llmApiKeys.findFirst.mockResolvedValue({ id: "key-1" });
        return fn(tx);
      },
    );

    (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue({
      id: jobConfigurationId,
      evalTemplate: {
        id: templateId,
        name: "Hallucination Check",
        provider: null,
        model: null,
      },
    });

    await pauseEvalConfigOnUnrecoverableError({
      jobExecutionId,
      projectId,
      suspendCode: JobConfigSuspendCode.LLM_401,
    });

    expect(tx.llmApiKeys.update).toHaveBeenCalledWith({
      where: { id: "key-1" },
      data: {
        status: LlmApiKeyStatus.ERROR,
        statusMessage:
          "LLM API returned 401 Unauthorized. Check your LLM connection.",
      },
    });
    expect(clearAllEvalConfigsCaches).toHaveBeenCalledWith(projectId);
  });

  it("skips email when template is not found, but still suspends config", async () => {
    (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
      jobConfigurationId,
      jobTemplateId: null,
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

    // No template found
    (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue({
      id: jobConfigurationId,
      evalTemplate: null,
    });

    await pauseEvalConfigOnUnrecoverableError({
      jobExecutionId,
      projectId,
      suspendCode: JobConfigSuspendCode.MODEL_CONFIG_MISSING,
    });

    // Config should still be suspended
    expect(tx.jobConfiguration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: JobConfigState.SUSPENDED,
          suspendCode: JobConfigSuspendCode.MODEL_CONFIG_MISSING,
        }),
      }),
    );
    expect(clearAllEvalConfigsCaches).toHaveBeenCalledWith(projectId);

    await flushPromises();
    // No email sent since template is missing
    expect(sendEvalPausedEmail).not.toHaveBeenCalled();
  });
});
