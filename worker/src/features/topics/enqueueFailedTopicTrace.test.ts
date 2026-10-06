import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: true,
  facets: vi.fn(),
  create: vi.fn(),
  enqueue: vi.fn(),
  project: vi.fn(),
  retain: vi.fn(),
  models: {
    summaryModel: "us.openai.gpt-5.6-luna",
    embeddingModel: "eu.cohere.embed-v4:0",
  },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { project: { findUnique: mocks.project } },
}));

vi.mock("@langfuse/shared/topics/server", () => ({
  isTopicsProjectEnabled: () => mocks.enabled,
  ensureDefaultTopicFacets: mocks.facets,
  getTopicsModelConfig: () => mocks.models,
  createAutomaticTopicExecution: mocks.create,
  enqueueTopicExecution: mocks.enqueue,
}));

import { enqueueFailedTopicTrace } from "./enqueueFailedTopicTrace";

const input = {
  projectId: "project",
  traceId: "failed-trace",
  traceTimestamp: "2026-10-06T00:00:00.000Z",
};
const facet = (id: string, projectId = "project") => ({
  projectId,
  versions: [
    { facetId: id, version: 2 },
    { facetId: id, version: 1 },
  ],
});

beforeEach(() => {
  mocks.enabled = true;
  mocks.models.summaryModel = "us.openai.gpt-5.6-luna";
  mocks.models.embeddingModel = "eu.cohere.embed-v4:0";
  mocks.facets
    .mockReset()
    .mockResolvedValue([facet("intent"), facet("issues")]);
  mocks.create.mockReset().mockResolvedValue({ id: "execution" });
  mocks.enqueue.mockReset().mockResolvedValue(undefined);
  mocks.project.mockReset().mockResolvedValue({ id: "project" });
  mocks.retain.mockReset().mockResolvedValue(undefined);
});

describe("enqueueFailedTopicTrace", () => {
  it("retains only the failed source with compatible-result reuse and stable admission", async () => {
    await enqueueFailedTopicTrace(input, mocks.retain);
    mocks.facets.mockResolvedValue([
      facet("issues"),
      facet("intent"),
      facet("foreign", "other"),
    ]);
    await enqueueFailedTopicTrace(input, mocks.retain);
    const first = mocks.create.mock.calls[0]![0];
    expect(first).toMatchObject({
      projectId: "project",
      operation: "process",
      traceIds: ["failed-trace"],
      facets: [
        { facetId: "intent", version: 2 },
        { facetId: "issues", version: 2 },
      ],
      reuseExistingSummaries: true,
      processingConfig: { summaryModel: mocks.models.summaryModel },
      embeddingConfig: {
        embeddingModel: mocks.models.embeddingModel,
        embeddingDimensions: 1024,
      },
    });
    expect(mocks.create.mock.calls[1]![0]).toEqual(first);
    expect(mocks.enqueue).toHaveBeenLastCalledWith("project", "execution", [
      "failed-trace",
    ]);
    await enqueueFailedTopicTrace(
      {
        ...input,
        traceTimestamp: "2026-10-05T00:00:00.000Z",
      },
      mocks.retain,
    );
    expect(mocks.create.mock.calls[2]![0].requestId).not.toBe(first.requestId);
    mocks.models.summaryModel = "another-model";
    await enqueueFailedTopicTrace(input, mocks.retain);
    expect(mocks.create.mock.calls[3]![0].requestId).not.toBe(first.requestId);
  });

  it("replays the accepted recovery identity when facets and models change after failed admission", async () => {
    const scope = {
      projectId: "project",
      facets: [{ facetId: "intent", version: 1 }],
      processingConfig: {
        summaryModel: "accepted-summary",
        maxInputTokens: 120000,
        maxOutputTokens: 512,
      },
      embeddingConfig: {
        embeddingModel: "accepted-embedding",
        embeddingDimensions: 1024,
      },
    };
    let pending: Parameters<typeof enqueueFailedTopicTrace>[0] = { ...input };
    const retain = vi.fn(async (value: typeof pending) => {
      pending = structuredClone(value);
    });
    mocks.create.mockImplementation(async (value) => ({ id: value.requestId }));
    mocks.enqueue.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(
      enqueueFailedTopicTrace(pending, retain, scope),
    ).rejects.toThrow("Redis unavailable");
    const accepted = structuredClone(mocks.create.mock.calls[0]![0]);
    expect(accepted).toMatchObject(scope);

    mocks.facets.mockResolvedValue([
      { projectId: "project", versions: [{ facetId: "intent", version: 3 }] },
    ]);
    mocks.models.summaryModel = "another-summary-model";
    mocks.models.embeddingModel = "another-embedding-model";
    await enqueueFailedTopicTrace(pending, retain);

    expect(mocks.create.mock.calls[1]![0]).toEqual(accepted);
    expect(mocks.enqueue.mock.calls[1]).toEqual(mocks.enqueue.mock.calls[0]);
    expect(mocks.facets).not.toHaveBeenCalled();
    expect(retain.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0],
    );
  });

  it("does not create an execution when retaining its accepted input fails", async () => {
    const retain = vi.fn().mockRejectedValue(new Error("Redis unavailable"));
    await expect(enqueueFailedTopicTrace(input, retain)).rejects.toThrow(
      "Redis unavailable",
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("retains an accepted recovery while its project is temporarily disabled", async () => {
    let pending: Parameters<typeof enqueueFailedTopicTrace>[0] = { ...input };
    const retain = vi.fn(async (value: typeof pending) => {
      pending = structuredClone(value);
    });
    mocks.enqueue.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(enqueueFailedTopicTrace(pending, retain)).rejects.toThrow(
      "Redis unavailable",
    );
    mocks.enabled = false;
    await expect(enqueueFailedTopicTrace(pending, retain)).rejects.toThrow(
      "pending accepted recovery admission",
    );
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    mocks.enabled = true;
    await enqueueFailedTopicTrace(pending, retain);
    expect(mocks.create.mock.calls[1]![0]).toEqual(
      mocks.create.mock.calls[0]![0],
    );
    expect(mocks.facets).toHaveBeenCalledOnce();
  });

  it("rejects retained recovery input from another project", async () => {
    await enqueueFailedTopicTrace(input, mocks.retain);
    const accepted: Parameters<typeof enqueueFailedTopicTrace>[0] =
      structuredClone(mocks.retain.mock.calls[0][0]);
    accepted.input!.projectId = "another-project";
    mocks.create.mockClear();
    mocks.enqueue.mockClear();
    await expect(
      enqueueFailedTopicTrace(accepted, mocks.retain),
    ).rejects.toThrow("does not match its source reference");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("does not recreate recovery work for a deleted project", async () => {
    mocks.project.mockResolvedValue(null);
    await enqueueFailedTopicTrace(input, mocks.retain);
    expect(mocks.facets).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
