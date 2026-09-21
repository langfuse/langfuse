/** @jest-environment node */
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  validateAndInflateScore,
} from "@langfuse/shared/src/server";
import {
  InvalidRequestError,
  LangfuseNotFoundError,
  ScoreSourceEnum,
} from "@langfuse/shared";

describe("validateAndInflateScore", () => {
  describe("configId scoping", () => {
    it("throws LangfuseNotFoundError when configId belongs to another project", async () => {
      // Config owned by a different project than the caller.
      const { projectId: ownerProjectId } = await createOrgProjectAndApiKey();
      const { projectId: callerProjectId } = await createOrgProjectAndApiKey();
      const foreignConfigId = v4();
      await prisma.scoreConfig.create({
        data: {
          id: foreignConfigId,
          name: "helpfulness",
          dataType: "NUMERIC",
          maxValue: 1,
          projectId: ownerProjectId,
        },
      });

      await expect(
        validateAndInflateScore({
          projectId: callerProjectId,
          scoreId: v4(),
          body: {
            id: v4(),
            name: "helpfulness",
            traceId: v4(),
            value: 0.5,
            dataType: "NUMERIC",
            configId: foreignConfigId,
            source: ScoreSourceEnum.ANNOTATION,
            environment: "default",
          },
        }),
      ).rejects.toThrow(LangfuseNotFoundError);
    });

    it("throws LangfuseNotFoundError when configId does not exist at all", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      await expect(
        validateAndInflateScore({
          projectId,
          scoreId: v4(),
          body: {
            id: v4(),
            name: "helpfulness",
            traceId: v4(),
            value: 0.5,
            dataType: "NUMERIC",
            configId: v4(),
            source: ScoreSourceEnum.ANNOTATION,
            environment: "default",
          },
        }),
      ).rejects.toThrow(LangfuseNotFoundError);
    });

    it("accepts a configId owned by the caller's project", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const configId = v4();
      await prisma.scoreConfig.create({
        data: {
          id: configId,
          name: "helpfulness",
          dataType: "NUMERIC",
          maxValue: 1,
          projectId,
        },
      });

      await expect(
        validateAndInflateScore({
          projectId,
          scoreId: v4(),
          body: {
            id: v4(),
            name: "helpfulness",
            traceId: v4(),
            value: 0.5,
            dataType: "NUMERIC",
            configId,
            source: ScoreSourceEnum.ANNOTATION,
            environment: "default",
          },
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("source=ANNOTATION rule", () => {
    it("throws InvalidRequestError when source is ANNOTATION without a configId", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      await expect(
        validateAndInflateScore({
          projectId,
          scoreId: v4(),
          body: {
            id: v4(),
            name: "helpfulness",
            traceId: v4(),
            value: 0.5,
            dataType: "NUMERIC",
            source: ScoreSourceEnum.ANNOTATION,
            environment: "default",
          },
        }),
      ).rejects.toThrow(InvalidRequestError);
    });

    it("allows source=ANNOTATION without a configId for CORRECTION scores", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      await expect(
        validateAndInflateScore({
          projectId,
          scoreId: v4(),
          body: {
            id: v4(),
            name: "output",
            traceId: v4(),
            value: "corrected output text",
            dataType: "CORRECTION",
            source: ScoreSourceEnum.ANNOTATION,
            environment: "default",
          },
        }),
      ).resolves.toBeDefined();
    });
  });
});
