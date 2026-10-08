import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidRequestError } from "../../errors";
import { DEFAULT_TOPIC_FACETS, type TopicsSetup } from "../../topics";

const mocks = vi.hoisted(() => ({
  saveModels: vi.fn(),
  ensureFacets: vi.fn(),
  listRules: vi.fn(),
  saveRule: vi.fn(),
}));

vi.mock("./model-config", () => ({
  saveTopicsModelSettings: mocks.saveModels,
}));
vi.mock("./postgres", () => ({
  ensureDefaultTopicFacets: mocks.ensureFacets,
  listTopicRules: mocks.listRules,
  saveTopicRule: mocks.saveRule,
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

const setup: TopicsSetup = {
  summary: { llmApiKeyId: "key", model: "gpt" },
  embedding: { llmApiKeyId: "key", model: "embed" },
  embeddingDimensions: 1024,
  clustering: { llmApiKeyId: "key", model: "cluster" },
  enabled: true,
  facets: facets.map((facet) => ({
    name: facet.name,
    enabled: facet.enabled,
  })),
  filter: [{ column: "name", type: "string", operator: "=", value: "billing" }],
  sampling: 0.25,
  idleSeconds: 120,
};

describe("Topics setup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.ensureFacets.mockResolvedValue(facets);
    mocks.saveRule.mockResolvedValue({ id: "rule-a" });
  });

  it("creates the built-in facets and one rule for the enabled ones", async () => {
    mocks.listRules.mockResolvedValue([]);

    await saveTopicsSetup(projectId, setup);

    expect(mocks.saveModels).toHaveBeenCalledWith(projectId, {
      summary: setup.summary,
      embedding: setup.embedding,
      embeddingDimensions: 1024,
      clustering: setup.clustering,
      enabled: true,
    });
    expect(mocks.ensureFacets).toHaveBeenCalledWith(projectId);
    expect(mocks.saveRule).toHaveBeenCalledWith({
      id: undefined,
      projectId,
      name: "Topics",
      filter: setup.filter,
      sampling: 0.25,
      idleTimeMs: 120_000,
      facetIds: facets.flatMap((facet) => (facet.enabled ? [facet.id] : [])),
    });
  });

  it("updates the existing rule instead of creating another", async () => {
    mocks.listRules.mockResolvedValue([
      { id: "rule-a", name: "Topics", facetIds: ["intent"] },
    ]);

    await saveTopicsSetup(projectId, setup);

    expect(mocks.saveRule).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rule-a", name: "Topics" }),
    );
  });

  it("rejects a project that already has more than one Topics rule", async () => {
    mocks.listRules.mockResolvedValue([{ id: "rule-a" }, { id: "rule-b" }]);

    await expect(saveTopicsSetup(projectId, setup)).rejects.toBeInstanceOf(
      InvalidRequestError,
    );
    expect(mocks.saveModels).not.toHaveBeenCalled();
    expect(mocks.saveRule).not.toHaveBeenCalled();
  });

  it("rejects a setup with every facet turned off", async () => {
    await expect(
      saveTopicsSetup(projectId, {
        ...setup,
        facets: setup.facets.map((facet) => ({ ...facet, enabled: false })),
      }),
    ).rejects.toThrow(/at least one facet/);
    expect(mocks.listRules).not.toHaveBeenCalled();
    expect(mocks.saveModels).not.toHaveBeenCalled();
  });

  it("rejects a setup that leaves out a built-in facet", async () => {
    await expect(
      saveTopicsSetup(projectId, {
        ...setup,
        facets: setup.facets.slice(1),
      }),
    ).rejects.toThrow(/each built-in facet/);
    expect(mocks.saveModels).not.toHaveBeenCalled();
  });
});
