import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  applyTopicRuleProcessingCostBatch,
  ensureDefaultTopicFacets,
  getTopicRuleMapCost,
  saveTopicRule,
} from "@langfuse/shared/topics/server";
import {
  bufferTopicRuleProcessingCosts,
  dirtyTopicProcessingCostProjects,
  flushTopicProjectProcessingCosts,
} from "./processingCostBuffer";

const orgId = randomUUID();
const projectId = randomUUID();

beforeAll(async () => {
  await prisma.organization.create({
    data: {
      id: orgId,
      name: "Topic cost buffering",
      projects: { create: { id: projectId, name: "Cost buffering" } },
    },
  });
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

it("coalesces receipts and recovers a committed batch after a lost acknowledgement", async () => {
  const [facet] = await ensureDefaultTopicFacets(projectId);
  const { id: ruleId } = await saveTopicRule({
    projectId,
    facetIds: [facet.id],
  });
  const report = (cost: number | null) => ({
    projectId,
    receiptId: randomUUID(),
    recordedAt: new Date(),
    shares: [{ ruleId, cost, partial: cost === null }],
  });
  const first = report(0.01);
  await Promise.all([
    bufferTopicRuleProcessingCosts(first),
    bufferTopicRuleProcessingCosts(first),
    bufferTopicRuleProcessingCosts(report(0.02)),
    bufferTopicRuleProcessingCosts(report(null)),
  ]);
  const isDirty = async () => {
    for await (const id of dirtyTopicProcessingCostProjects()) {
      if (id === projectId) return true;
    }
    return false;
  };
  expect(await isDirty()).toBe(true);
  const read = () => getTopicRuleMapCost(projectId, ruleId);
  expect(await read()).toMatchObject({ cost: 0, updatedAt: null });

  const apply = vi.fn(applyTopicRuleProcessingCostBatch);
  apply.mockImplementationOnce(async (batch) => {
    await applyTopicRuleProcessingCostBatch(batch);
    throw new Error("connection lost after commit");
  });
  await expect(
    flushTopicProjectProcessingCosts(projectId, apply),
  ).rejects.toThrow("connection lost");
  expect(apply).toHaveBeenCalledTimes(1);
  expect(await isDirty()).toBe(true);
  expect(await read()).toMatchObject({ cost: 0.03, partial: true });

  await bufferTopicRuleProcessingCosts(first);
  await bufferTopicRuleProcessingCosts(report(0.04));
  const stalled = Promise.withResolvers<void>();
  const captured = Promise.withResolvers<void>();
  const staleFlush = flushTopicProjectProcessingCosts(
    projectId,
    async (batch) => {
      captured.resolve();
      await stalled.promise;
      await apply(batch);
    },
  );
  await captured.promise;
  try {
    // A replacement worker replays the commit, then flushes new work.
    await flushTopicProjectProcessingCosts(projectId, apply);
    await flushTopicProjectProcessingCosts(projectId, apply);
    expect(apply.mock.calls[1]).toEqual(apply.mock.calls[0]);
    expect(apply.mock.calls[2][0].sequence).toBeGreaterThan(
      apply.mock.calls[0][0].sequence,
    );
    await bufferTopicRuleProcessingCosts(report(0.05));
    // Leave the next batch frozen and unpaid while the original flusher resumes.
    await expect(
      flushTopicProjectProcessingCosts(projectId, async () => {
        throw new Error("database unavailable");
      }),
    ).rejects.toThrow("database unavailable");
  } finally {
    stalled.resolve();
    await staleFlush;
  }
  expect(await read()).toMatchObject({ cost: 0.07, partial: true });
  expect(await isDirty()).toBe(true);
  await flushTopicProjectProcessingCosts(projectId, apply);
  const latest = await read();
  expect(latest).toMatchObject({
    cost: 0.12,
    partial: true,
    updatedAt: expect.any(String),
  });
  await flushTopicProjectProcessingCosts(projectId, apply);
  expect(await read()).toEqual(latest);
  expect(apply).toHaveBeenCalledTimes(5);
  expect(await isDirty()).toBe(false);
});
