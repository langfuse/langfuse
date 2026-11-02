import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidRequestError } from "../../errors";
import { DEFAULT_TOPIC_FACETS } from "../../topics";

const mocks = vi.hoisted(() => ({
  prepareModels: vi.fn(),
  writeModels: vi.fn(),
  ensureFacets: vi.fn(),
  saveRule: vi.fn(),
  writeReadiness: vi.fn(),
  cacheReadiness: vi.fn(),
}));

vi.mock("./model-config", () => ({
  prepareTopicsModelSettings: mocks.prepareModels,
  writeTopicsModelSettings: mocks.writeModels,
}));
vi.mock("./postgres", () => ({
  ensureDefaultTopicFacets: mocks.ensureFacets,
  writeTopicRule: mocks.saveRule,
}));
vi.mock("../tracingReadinessSettings", () => ({
  writeTracingReadinessSettings: mocks.writeReadiness,
  cacheTracingReadinessSettings: mocks.cacheReadiness,
}));
vi.mock("../../db", () => ({
  prisma: {
    $transaction: (callback: (tx: string) => Promise<unknown>) =>
      callback("tx"),
  },
}));

import { saveTopicsSetup } from "./setup";

const projectId = "project-a";
const facets = DEFAULT_TOPIC_FACETS.map((facet, index) => ({
  id: facet.name.toLowerCase(),
  projectId,
  name: facet.name,
  description: facet.description,
  isBuiltIn: true,
  versions: [],
  enabled: index !== 1,
}));

const setup = {
  summary: { llmApiKeyId: "key", model: "gpt" },
  embedding: { llmApiKeyId: "key", model: "embed" },
  embeddingDimensions: 1024,
  clustering: { llmApiKeyId: "key", model: "cluster" },
  facets: facets.map((facet) => ({
    name: facet.name,
    enabled: facet.enabled,
  })),
  filter: [{ column: "name", type: "string", operator: "=", value: "billing" }],
  traceIdleMs: 120_000,
} satisfies Parameters<typeof saveTopicsSetup>[1];

describe("Topics setup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.ensureFacets.mockResolvedValue(facets);
    mocks.saveRule.mockResolvedValue({ id: "rule-a" });
    mocks.prepareModels.mockResolvedValue({ summaryModel: "gpt" });
  });

  it("creates the built-in facets and one rule for the enabled ones", async () => {
    await saveTopicsSetup(projectId, setup, "user-a");

    expect(mocks.prepareModels).toHaveBeenCalledWith(projectId, {
      summary: setup.summary,
      embedding: setup.embedding,
      embeddingDimensions: 1024,
      clustering: setup.clustering,
    });
    expect(mocks.ensureFacets).toHaveBeenCalledWith(projectId);
    expect(mocks.saveRule).toHaveBeenCalledWith("tx", {
      projectId,
      filter: setup.filter,
      facetIds: facets.flatMap((facet) => (facet.enabled ? [facet.id] : [])),
      userId: "user-a",
    });
    expect(mocks.writeModels).toHaveBeenCalledWith(
      projectId,
      { summaryModel: "gpt" },
      { userId: "user-a", tx: "tx" },
    );
    expect(mocks.writeReadiness).toHaveBeenCalledWith(
      "tx",
      projectId,
      { traceIdleMs: 120_000 },
      "user-a",
    );
    expect(mocks.cacheReadiness).toHaveBeenCalledWith(projectId, {
      traceIdleMs: 120_000,
    });
  });

  it("enables the models only after the rule is saved", async () => {
    mocks.saveRule.mockRejectedValue(
      new InvalidRequestError("This project has more than one Topics rule."),
    );

    await expect(saveTopicsSetup(projectId, setup)).rejects.toThrow(
      "more than one Topics rule",
    );
    expect(mocks.prepareModels).toHaveBeenCalledOnce();
    expect(mocks.writeModels).not.toHaveBeenCalled();
    expect(mocks.writeReadiness).not.toHaveBeenCalled();
  });

  it("keeps enabled custom facets assigned to the rule", async () => {
    await saveTopicsSetup(projectId, {
      ...setup,
      customFacetIds: ["custom-language"],
    });

    expect(mocks.saveRule).toHaveBeenCalledWith(
      "tx",
      expect.objectContaining({
        facetIds: expect.arrayContaining(["intent", "custom-language"]),
      }),
    );
  });

  it("rejects a setup with every facet turned off", async () => {
    await expect(
      saveTopicsSetup(projectId, {
        ...setup,
        facets: setup.facets.map((facet) => ({ ...facet, enabled: false })),
      }),
    ).rejects.toThrow(/at least one facet/);
    expect(mocks.prepareModels).not.toHaveBeenCalled();
  });

  it("rejects a setup that leaves out a built-in facet", async () => {
    await expect(
      saveTopicsSetup(projectId, {
        ...setup,
        facets: setup.facets.slice(1),
      }),
    ).rejects.toThrow(/each built-in facet/);
    expect(mocks.prepareModels).not.toHaveBeenCalled();
  });

  it("rejects an idle time below 60 seconds before testing models", async () => {
    await expect(
      saveTopicsSetup(projectId, { ...setup, traceIdleMs: 59_000 }),
    ).rejects.toThrow(/at least 60 seconds/);
    expect(mocks.prepareModels).not.toHaveBeenCalled();
  });
});
