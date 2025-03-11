/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { Session } from "next-auth";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createScore,
  createScoresCh,
  getScoresByIds,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import waitForExpect from "wait-for-expect";

describe("scores trpc", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  beforeEach(async () => await pruneDatabase());

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: "seed-org-id",
          name: "Test Organization",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  describe("scores.deleteMany", () => {
    it("should delete scores by ids", async () => {
      // Setup
      const createdScore = createScore({
        project_id: projectId,
      });
      await createScoresCh([createdScore]);

      // When
      await caller.scores.deleteMany({
        projectId,
        scoreIds: [createdScore.id],
      });

      // Then
      await waitForExpect(async () => {
        const scores = await getScoresByIds(projectId, [createdScore.id]);
        expect(scores).toHaveLength(0);
      });
    });

    it("should delete scores via batch query", async () => {
      // Setup
      const scoreName = randomUUID();
      const createdScore = createScore({
        project_id: projectId,
        name: scoreName,
      });
      await createScoresCh([createdScore]);

      // When
      await caller.scores.deleteMany({
        projectId,
        scoreIds: null,
        isBatchAction: true,
        query: {
          orderBy: { column: "timestamp", order: "ASC" },
          filter: [
            {
              column: "name",
              operator: "=",
              value: scoreName,
              type: "string",
            },
          ],
        },
      });

      // Then
      await waitForExpect(async () => {
        const scores = await getScoresByIds(projectId, [createdScore.id]);
        expect(scores).toHaveLength(0);
      });
    });

    it("should throw an error if batchAction and scoreIds are missing", async () => {
      // When
      const promise = caller.scores.deleteMany({
        projectId,
        scoreIds: null,
        isBatchAction: false,
      });

      // Then
      await expect(promise).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message:
          "Either batchAction or scoreIds must be provided to delete scores.",
      });
    });
  });
});
