import {
  EvaluatorBlockReason,
  JobConfigState,
  type Prisma,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { blockEvaluatorConfigsInTx } from "../../../packages/shared/src/server/services/blockEvaluatorConfigs";

describe("blockEvaluatorConfigsInTx", () => {
  it("only returns newly blocked active evaluators", async () => {
    const blockedAt = new Date("2026-03-09T00:00:00.000Z");
    const scope: Prisma.JobConfigurationWhereInput = {
      evalTemplateId: {
        in: ["template-1", "template-2"],
      },
    };

    const findMany = vi.fn().mockResolvedValue([{ id: "config-new" }]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      jobConfiguration: {
        findMany,
        updateMany,
      },
    } as unknown as Prisma.TransactionClient;

    const result = await blockEvaluatorConfigsInTx({
      tx,
      projectId: "project-1",
      where: scope,
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
      blockMessage: "LLM connection missing",
      blockedAt,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          scope,
          {
            projectId: "project-1",
            status: JobConfigState.ACTIVE,
            blockedAt: null,
          },
        ],
      },
      select: {
        id: true,
      },
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        status: JobConfigState.ACTIVE,
        blockedAt: null,
        id: {
          in: ["config-new"],
        },
      },
      data: {
        blockedAt,
        blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
        blockMessage: "LLM connection missing",
      },
    });

    expect(result).toEqual({
      blockedJobConfigIds: ["config-new"],
    });
  });

  it("is a no-op when no explicit scope is provided", async () => {
    const findMany = vi.fn();
    const updateMany = vi.fn();
    const tx = {
      jobConfiguration: {
        findMany,
        updateMany,
      },
    } as unknown as Prisma.TransactionClient;

    const result = await blockEvaluatorConfigsInTx({
      tx,
      projectId: "project-1",
      where: {},
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
      blockMessage: "LLM connection missing",
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      blockedJobConfigIds: [],
    });
  });
});
