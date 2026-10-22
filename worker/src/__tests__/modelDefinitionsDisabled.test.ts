import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../packages/shared/src/db";
import { v4 as uuidv4 } from "uuid";

type SharedServerModule = typeof import("../../../packages/shared/src/server");

let createOrgProjectAndApiKey: SharedServerModule["createOrgProjectAndApiKey"];
let redis: SharedServerModule["redis"];
let findModel: SharedServerModule["findModel"];
let findModelInPostgres: SharedServerModule["findModelInPostgres"];
let getRedisModelKey: SharedServerModule["getRedisModelKey"];
let isModelDefinitionsEnabled: SharedServerModule["isModelDefinitionsEnabled"];

// The switch is read through the shared env module, which validates once at
// import, so the module graph is rebuilt with the flag already set.
describe("model definitions disabled", () => {
  beforeAll(async () => {
    vi.stubEnv("LANGFUSE_MODEL_DEFINITIONS_ENABLED", "false");
    vi.resetModules();

    ({
      createOrgProjectAndApiKey,
      redis,
      findModel,
      findModelInPostgres,
      getRedisModelKey,
      isModelDefinitionsEnabled,
    } = await import("../../../packages/shared/src/server"));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports the instance switch as off", () => {
    expect(isModelDefinitionsEnabled()).toBe(false);
  });

  it("resolves no model even when a matching definition exists", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const modelId = uuidv4();
    await prisma.model.create({
      data: {
        projectId,
        id: modelId,
        modelName: "gpt-4",
        matchPattern: "gpt-4",
        unit: "TOKENS",
        tokenizerId: "openai",
        pricingTiers: {
          create: {
            name: "Standard",
            isDefault: true,
            conditions: [],
            priority: 0,
            prices: { create: { modelId, usageType: "input", price: "0.03" } },
          },
        },
      },
    });

    // The row is matchable; only findModel declines to look.
    await expect(
      findModelInPostgres({ projectId, model: "gpt-4" }),
    ).resolves.toMatchObject({ id: modelId });

    const result = await findModel({ projectId, model: "gpt-4" });

    // No model is what stops cost calculation and tokenization downstream:
    // IngestionService tokenizes only when a model was matched, and
    // calculateUsageCosts computes nothing without prices.
    expect(result.model).toBeNull();
    expect(result.pricingTiers).toEqual([]);
  });

  it("writes no cache entry, not even a not-found token", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    await findModel({ projectId, model: "gpt-4o" });

    const cachedValue = await redis?.get(
      getRedisModelKey({ projectId, model: "gpt-4o" }),
    );
    expect(cachedValue).toBeNull();
  });
});
