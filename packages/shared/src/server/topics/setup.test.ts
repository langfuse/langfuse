import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidRequestError } from "../../errors";
import { DEFAULT_TOPIC_FACETS } from "../../topics";

const mocks = vi.hoisted(() => ({
  prepareModels: vi.fn(),
  writeModels: vi.fn(),
  ensureFacets: vi.fn(),
  saveRule: vi.fn(),
}));

vi.mock("./model-config", () => ({
  prepareTopicsModelSettings: mocks.prepareModels,
  writeTopicsModelSettings: mocks.writeModels,
}));
vi.mock("./postgres", () => ({
  ensureDefaultTopicFacets: mocks.ensureFacets,
  writeTopicRule: mocks.saveRule,
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
  enabled: true,
  facets: facets.map((facet) => ({
    name: facet.name,
    enabled: facet.enabled,
  })),
  filter: [{ column: "name", type: "string", operator: "=", value: "billing" }],
  sampling: 0.25,
  idleSeconds: 120,
} satisfies Parameters<typeof saveTopicsSetup>[1];

describe("Topics setup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.ensureFacets.mockResolvedValue(facets);
    mocks.saveRule.mockResolvedValue({ id: "rule-a" });
    mocks.prepareModels.mockResolvedValue({ enabled: true });
  });

  it("creates the built-in facets and one rule for the enabled ones", async () => {
    await saveTopicsSetup(projectId, setup);

    expect(mocks.prepareModels).toHaveBeenCalledWith(projectId, {
      summary: setup.summary,
      embedding: setup.embedding,
      embeddingDimensions: 1024,
      clustering: setup.clustering,
      enabled: true,
    });
    expect(mocks.ensureFacets).toHaveBeenCalledWith(projectId);
    expect(mocks.saveRule).toHaveBeenCalledWith("tx", {
      projectId,
      filter: setup.filter,
      sampling: 0.25,
      idleTimeMs: 120_000,
      facetIds: facets.flatMap((facet) => (facet.enabled ? [facet.id] : [])),
    });
    expect(mocks.writeModels).toHaveBeenCalledWith(
      projectId,
      { enabled: true },
      "tx",
    );
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
});
