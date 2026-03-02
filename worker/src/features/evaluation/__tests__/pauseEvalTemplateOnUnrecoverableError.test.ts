import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { EvalTemplateStatus } from "@langfuse/shared";
import { pauseEvalTemplateOnUnrecoverableError } from "../pauseEvalTemplateOnUnrecoverableError";

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    jobExecution: {
      findFirst: vi.fn(),
    },
    evalTemplate: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    clearNoEvalConfigsCache: vi.fn(),
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
    NEXTAUTH_URL: "",
    EMAIL_FROM_ADDRESS: "",
    SMTP_CONNECTION_URL: "",
  },
}));

import { prisma } from "@langfuse/shared/src/db";

const projectId = "proj-1";
const jobExecutionId = "job-exec-1";
const jobTemplateId = "tpl-1";

function createMockTx() {
  return {
    defaultLlmModel: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    llmApiKeys: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    evalTemplate: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    jobConfiguration: {
      updateMany: vi.fn(),
    },
    jobExecution: {
      updateMany: vi.fn(),
    },
  };
}

describe("pauseEvalTemplateOnUnrecoverableError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as Mock).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = createMockTx();
        return fn(tx);
      },
    );
  });

  describe("no-op / idempotency", () => {
    it("returns early when no jobExecution", async () => {
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(null);

      await pauseEvalTemplateOnUnrecoverableError({
        jobExecutionId,
        projectId,
        statusCode: 401,
        errorMessage: "Unauthorized",
      });

      expect(prisma.jobExecution.findFirst).toHaveBeenCalledWith({
        where: { id: jobExecutionId, projectId },
        select: { jobTemplateId: true },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("returns early when jobExecution has no jobTemplateId", async () => {
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
        jobTemplateId: null,
      });

      await pauseEvalTemplateOnUnrecoverableError({
        jobExecutionId,
        projectId,
        statusCode: 401,
        errorMessage: "Unauthorized",
      });

      expect(prisma.evalTemplate.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("returns early when template not found", async () => {
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
        jobTemplateId,
      });
      (prisma.evalTemplate.findUnique as Mock).mockResolvedValue(null);

      await pauseEvalTemplateOnUnrecoverableError({
        jobExecutionId,
        projectId,
        statusCode: 401,
        errorMessage: "Unauthorized",
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("returns early when template already status ERROR", async () => {
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
        jobTemplateId,
      });
      (prisma.evalTemplate.findUnique as Mock).mockResolvedValue({
        id: jobTemplateId,
        projectId,
        provider: null,
        model: null,
        status: EvalTemplateStatus.ERROR,
        name: "T1",
      });

      await pauseEvalTemplateOnUnrecoverableError({
        jobExecutionId,
        projectId,
        statusCode: 401,
        errorMessage: "Unauthorized",
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("failing template used default (project-scoped)", () => {
    it("deletes default model, updates only project-scoped templates to ERROR, deactivates configs and cancels PENDING jobs", async () => {
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
        jobTemplateId,
      });
      (prisma.evalTemplate.findUnique as Mock).mockResolvedValue({
        id: jobTemplateId,
        projectId,
        provider: null,
        model: null,
        status: EvalTemplateStatus.OK,
        name: "T1",
      });

      let capturedTx: ReturnType<typeof createMockTx>;
      (prisma.$transaction as Mock).mockImplementation(
        async (
          fn: (tx: ReturnType<typeof createMockTx>) => Promise<unknown>,
        ) => {
          capturedTx = createMockTx();
          capturedTx.defaultLlmModel.findUnique.mockResolvedValue({
            provider: "openai",
            llmApiKeyId: "key-1",
          });
          capturedTx.llmApiKeys.findFirst.mockResolvedValue({
            id: "key-1",
            provider: "openai",
          });
          capturedTx.evalTemplate.findMany.mockResolvedValue([
            { id: jobTemplateId, projectId },
          ]);
          return fn(capturedTx);
        },
      );

      await pauseEvalTemplateOnUnrecoverableError({
        jobExecutionId,
        projectId,
        statusCode: 401,
        errorMessage: "Unauthorized",
      });

      expect(capturedTx!.defaultLlmModel.deleteMany).toHaveBeenCalledWith({
        where: { projectId },
      });
      expect(capturedTx!.evalTemplate.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [jobTemplateId] } },
        data: expect.objectContaining({
          status: EvalTemplateStatus.ERROR,
          statusReason: expect.objectContaining({ code: "LLM_401" }),
        }),
      });
      expect(capturedTx!.jobConfiguration.updateMany).toHaveBeenCalledWith({
        where: { evalTemplateId: { in: [jobTemplateId] } },
        data: { status: "INACTIVE" },
      });
      expect(capturedTx!.jobExecution.updateMany).toHaveBeenCalledWith({
        where: {
          jobTemplateId: { in: [jobTemplateId] },
          projectId,
          status: "PENDING",
        },
        data: expect.objectContaining({ status: "CANCELLED" }),
      });
    });
  });

  describe("failing template used default (global)", () => {
    it("does not update global template row to ERROR; still deactivates configs and cancels jobs", async () => {
      const globalTemplateId = "tpl-global";
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
        jobTemplateId: globalTemplateId,
      });
      (prisma.evalTemplate.findUnique as Mock).mockResolvedValue({
        id: globalTemplateId,
        projectId: null,
        provider: null,
        model: null,
        status: EvalTemplateStatus.OK,
        name: "Global",
      });

      const mockTx = createMockTx();
      mockTx.defaultLlmModel.findUnique.mockResolvedValue({
        provider: "openai",
        llmApiKeyId: "key-1",
      });
      mockTx.llmApiKeys.findFirst.mockResolvedValue({
        id: "key-1",
        provider: "openai",
      });
      mockTx.evalTemplate.findMany.mockResolvedValue([
        { id: globalTemplateId, projectId: null },
      ]);

      (prisma.$transaction as Mock).mockImplementation(async (fn) =>
        fn(mockTx),
      );

      await pauseEvalTemplateOnUnrecoverableError({
        jobExecutionId,
        projectId,
        statusCode: 404,
        errorMessage: "Model not found",
      });

      expect(mockTx.defaultLlmModel.deleteMany).toHaveBeenCalledWith({
        where: { projectId },
      });
      expect(mockTx.evalTemplate.updateMany).not.toHaveBeenCalled();
      expect(mockTx.jobConfiguration.updateMany).toHaveBeenCalledWith({
        where: { evalTemplateId: { in: [globalTemplateId] } },
        data: { status: "INACTIVE" },
      });
      expect(mockTx.jobExecution.updateMany).toHaveBeenCalled();
    });
  });

  describe("failing template had specific model (project-scoped)", () => {
    it("updates that template to ERROR, deactivates configs and cancels jobs; no default deletion", async () => {
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
        jobTemplateId,
      });
      (prisma.evalTemplate.findUnique as Mock).mockResolvedValue({
        id: jobTemplateId,
        projectId,
        provider: "openai",
        model: "gpt-4",
        status: EvalTemplateStatus.OK,
        name: "T1",
      });

      const mockTx = createMockTx();
      mockTx.llmApiKeys.findFirst.mockResolvedValue({
        id: "key-1",
        provider: "openai",
      });

      (prisma.$transaction as Mock).mockImplementation(async (fn) =>
        fn(mockTx),
      );

      await pauseEvalTemplateOnUnrecoverableError({
        jobExecutionId,
        projectId,
        statusCode: 401,
        errorMessage: "Invalid API key",
      });

      expect(mockTx.defaultLlmModel.deleteMany).not.toHaveBeenCalled();
      expect(mockTx.evalTemplate.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [jobTemplateId] } },
        data: expect.objectContaining({
          status: EvalTemplateStatus.ERROR,
          statusReason: expect.objectContaining({ code: "LLM_401" }),
        }),
      });
      expect(mockTx.jobConfiguration.updateMany).toHaveBeenCalledWith({
        where: { evalTemplateId: { in: [jobTemplateId] } },
        data: { status: "INACTIVE" },
      });
      expect(mockTx.jobExecution.updateMany).toHaveBeenCalled();
    });
  });

  describe("failing template had specific model (global)", () => {
    it("does not update template row; deactivates configs and cancels jobs", async () => {
      const globalTemplateId = "tpl-global-specific";
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue({
        jobTemplateId: globalTemplateId,
      });
      (prisma.evalTemplate.findUnique as Mock).mockResolvedValue({
        id: globalTemplateId,
        projectId: null,
        provider: "openai",
        model: "gpt-4",
        status: EvalTemplateStatus.OK,
        name: "GlobalSpecific",
      });

      const mockTx = createMockTx();
      mockTx.llmApiKeys.findFirst.mockResolvedValue({
        id: "key-1",
        provider: "openai",
      });

      (prisma.$transaction as Mock).mockImplementation(async (fn) =>
        fn(mockTx),
      );

      await pauseEvalTemplateOnUnrecoverableError({
        jobExecutionId,
        projectId,
        statusCode: 404,
        errorMessage: "Model not found",
      });

      expect(mockTx.defaultLlmModel.deleteMany).not.toHaveBeenCalled();
      expect(mockTx.evalTemplate.updateMany).not.toHaveBeenCalled();
      expect(mockTx.jobConfiguration.updateMany).toHaveBeenCalledWith({
        where: { evalTemplateId: { in: [globalTemplateId] } },
        data: { status: "INACTIVE" },
      });
      expect(mockTx.jobExecution.updateMany).toHaveBeenCalled();
    });
  });
});
