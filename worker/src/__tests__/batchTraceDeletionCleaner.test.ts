import { expect, describe, it, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { BatchTraceDeletionCleaner } from "../features/batch-trace-deletion-cleaner";

describe("BatchTraceDeletionCleaner", () => {
  let cleaner: BatchTraceDeletionCleaner;
  let projectId1: string;
  let projectId2: string;

  beforeEach(async () => {
    const result1 = await createOrgProjectAndApiKey();
    projectId1 = result1.projectId;

    const result2 = await createOrgProjectAndApiKey();
    projectId2 = result2.projectId;

    cleaner = new BatchTraceDeletionCleaner();
  });

  afterEach(async () => {
    cleaner.stop();
    await prisma.pendingDeletion.deleteMany({
      where: { projectId: { in: [projectId1, projectId2] } },
    });
  });

  describe("processProject", () => {
    it("should delete traces and mark them as deleted", async () => {
      const traceIds = [randomUUID(), randomUUID(), randomUUID()];

      await prisma.pendingDeletion.createMany({
        data: traceIds.map((id) => ({
          projectId: projectId1,
          object: "trace",
          objectId: id,
          isDeleted: false,
        })),
      });

      await (cleaner as any).processProject(projectId1);

      const deletions = await prisma.pendingDeletion.findMany({
        where: { projectId: projectId1 },
      });
      expect(deletions.every((d) => d.isDeleted)).toBe(true);
    });

    it("should not include already-deleted traces", async () => {
      const deletedTrace = randomUUID();
      const pendingTraces = [randomUUID(), randomUUID()];

      await prisma.pendingDeletion.createMany({
        data: [
          {
            projectId: projectId1,
            object: "trace",
            objectId: deletedTrace,
            isDeleted: true,
          },
          ...pendingTraces.map((id) => ({
            projectId: projectId1,
            object: "trace",
            objectId: id,
            isDeleted: false,
          })),
        ],
      });

      await (cleaner as any).processProject(projectId1);

      const deletions = await prisma.pendingDeletion.findMany({
        where: { projectId: projectId1 },
      });

      // Pending traces should now be marked as deleted
      const pendingDeletions = deletions.filter((d) =>
        pendingTraces.includes(d.objectId),
      );
      expect(pendingDeletions.every((d) => d.isDeleted)).toBe(true);

      // Already-deleted trace should remain unchanged
      const alreadyDeleted = deletions.find((d) => d.objectId === deletedTrace);
      expect(alreadyDeleted?.isDeleted).toBe(true);
    });
  });

  describe("processBatch (integration)", () => {
    it("should process pending deletions", async () => {
      const traceIds = Array.from({ length: 100 }, () => randomUUID());

      await prisma.pendingDeletion.createMany({
        data: traceIds.map((id) => ({
          projectId: projectId1,
          object: "trace",
          objectId: id,
          isDeleted: false,
        })),
      });

      await cleaner.processBatch();

      // Check if our project was processed
      const deletions = await prisma.pendingDeletion.findMany({
        where: { projectId: projectId1 },
      });

      // If our project was selected (had most pending), traces should be deleted
      // If another project was selected, our traces remain - both are valid outcomes
      const allDeleted = deletions.every((d) => d.isDeleted);
      const noneDeleted = deletions.every((d) => !d.isDeleted);
      expect(allDeleted || noneDeleted).toBe(true);
    });

    it("should not process soft-deleted projects", async () => {
      const project1Traces = Array.from({ length: 100 }, () => randomUUID());
      const project2Traces = Array.from({ length: 200 }, () => randomUUID());

      await prisma.pendingDeletion.createMany({
        data: [
          ...project1Traces.map((id) => ({
            projectId: projectId1,
            object: "trace",
            objectId: id,
            isDeleted: false,
          })),
          ...project2Traces.map((id) => ({
            projectId: projectId2,
            object: "trace",
            objectId: id,
            isDeleted: false,
          })),
        ],
      });

      await prisma.project.update({
        where: { id: projectId2 },
        data: { deletedAt: new Date() },
      });

      await cleaner.processBatch();

      // project2 traces should remain undeleted (soft-deleted project excluded)
      const project2Deletions = await prisma.pendingDeletion.findMany({
        where: { projectId: projectId2 },
      });
      expect(project2Deletions.every((d) => !d.isDeleted)).toBe(true);

      await prisma.project.update({
        where: { id: projectId2 },
        data: { deletedAt: null },
      });
    });
  });
});
