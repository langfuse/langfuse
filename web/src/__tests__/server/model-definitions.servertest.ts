/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  DeleteModelV1Response,
  GetModelV1Response,
  GetModelsV1Response,
  PostModelsV1Response,
} from "@/src/features/public-api/types/models";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import type { z } from "zod/v4";

describe("/models API Endpoints", () => {
  type PublicModel = z.infer<typeof GetModelsV1Response>["data"][number];

  let auth: string;
  let projectId: string;
  let modelOneId: string;
  let modelTwoId: string;
  let fixtureModelName: string;

  const findModelsInPaginatedList = async (
    authHeader: string,
    modelIds: string[],
  ): Promise<Map<string, PublicModel>> => {
    const limit = 100;
    const pending = new Set(modelIds);
    const found = new Map<string, PublicModel>();
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && pending.size > 0) {
      const models = await makeZodVerifiedAPICall(
        GetModelsV1Response,
        "GET",
        `/api/public/models?page=${page}&limit=${limit}`,
        undefined,
        authHeader,
      );

      totalPages = models.body.meta.totalPages;

      for (const model of models.body.data) {
        if (pending.has(model.id)) {
          found.set(model.id, model);
          pending.delete(model.id);
        }
      }

      page += 1;
    }

    return found;
  };

  beforeEach(async () => {
    // Create authentication pairs
    const { auth: newAuth, projectId: newProjectId } =
      await createOrgProjectAndApiKey();
    auth = newAuth;
    projectId = newProjectId;
    modelOneId = v4();
    modelTwoId = v4();
    fixtureModelName = `gpt-3.5-turbo-${v4()}`;

    // create some default models that do not belong to a project
    await prisma.model.create({
      data: {
        id: modelOneId,
        modelName: fixtureModelName,
        inputPrice: "0.0010",
        outputPrice: "0.0020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: new Date("2023-12-02"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: "TOKENS",
      },
    });
    const pricingTierId1 = v4();
    await prisma.pricingTier.create({
      data: {
        id: pricingTierId1,
        isDefault: true,
        priority: 0,
        conditions: [],
        name: "Standard",
        modelId: modelOneId,
      },
    });
    await prisma.price.createMany({
      data: [
        {
          modelId: modelOneId,
          projectId: null,
          usageType: "input",
          price: 0.001,
          pricingTierId: pricingTierId1,
        },
        {
          modelId: modelOneId,
          projectId: null,
          usageType: "output",
          price: 0.002,
          pricingTierId: pricingTierId1,
        },
        {
          modelId: modelOneId,
          projectId: null,
          usageType: "total",
          price: 0.1,
          pricingTierId: pricingTierId1,
        },
      ],
    });

    await prisma.model.create({
      data: {
        id: modelTwoId,
        modelName: fixtureModelName,
        inputPrice: "0.0020",
        outputPrice: "0.0040",
        totalPrice: undefined,
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: new Date("2023-12-01"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: "TOKENS",
      },
    });
    const pricingTierId2 = v4();
    await prisma.pricingTier.create({
      data: {
        id: pricingTierId2,
        isDefault: true,
        priority: 0,
        conditions: [],
        name: "Standard",
        modelId: modelTwoId,
      },
    });
    await prisma.price.createMany({
      data: [
        {
          modelId: modelTwoId,
          projectId: null,
          usageType: "input",
          price: 0.02,
          pricingTierId: pricingTierId2,
        },
        {
          modelId: modelTwoId,
          projectId: null,
          usageType: "output",
          price: 0.04,
          pricingTierId: pricingTierId2,
        },
      ],
    });
  });
  afterEach(async () => {
    await prisma.price.deleteMany({
      where: {
        OR: [{ projectId }, { modelId: { in: [modelOneId, modelTwoId] } }],
      },
    });
    await prisma.pricingTier.deleteMany({
      where: {
        OR: [
          { modelId: { in: [modelOneId, modelTwoId] } },
          { model: { projectId } },
        ],
      },
    });
    await prisma.model.deleteMany({
      where: {
        OR: [{ id: { in: [modelOneId, modelTwoId] } }, { projectId }],
      },
    });
  });

  it("GET /models", async () => {
    const models = await makeZodVerifiedAPICall(
      GetModelsV1Response,
      "GET",
      "/api/public/models",
      undefined,
      auth,
    );
    expect(models.status).toBe(200);

    const foundModels = await findModelsInPaginatedList(auth, [
      modelOneId,
      modelTwoId,
    ]);
    expect(foundModels.size).toBe(2);

    const fixtureModel = foundModels.get(modelOneId);
    expect(fixtureModel).toMatchObject({
      isLangfuseManaged: true,
      modelName: fixtureModelName,
      prices: {
        input: expect.any(Object),
        output: expect.any(Object),
      },
    });
  });

  it("GET /models pagination", async () => {
    const models = await makeZodVerifiedAPICall(
      GetModelsV1Response,
      "GET",
      "/api/public/models?page=2&limit=1",
      undefined,
      auth,
    );
    expect(models.status).toBe(200);
    expect(models.body.data.length).toBe(1);
    expect(models.body.meta.page).toBe(2);
    expect(models.body.meta.limit).toBe(1);
    expect(models.body.meta.totalItems).toBeGreaterThanOrEqual(2);
    expect(models.body.meta.totalPages).toBeGreaterThanOrEqual(2);
  });

  it("Create and get custom model", async () => {
    const customModel = await makeZodVerifiedAPICall(
      PostModelsV1Response,
      "POST",
      "/api/public/models",
      {
        modelName: fixtureModelName,
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: "2023-12-01",
        inputPrice: 0.002,
        outputPrice: 0.004,
        unit: "TOKENS",
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
      },
      auth,
    );
    expect(customModel.body.isLangfuseManaged).toBe(false);
    expect(customModel.body.prices).toMatchObject({
      input: { price: 0.002 },
      output: { price: 0.004 },
    });

    const models = await makeZodVerifiedAPICall(
      GetModelsV1Response,
      "GET",
      "/api/public/models",
      undefined,
      auth,
    );
    expect(models.status).toBe(200);

    const foundModels = await findModelsInPaginatedList(auth, [
      customModel.body.id,
    ]);
    expect(foundModels.has(customModel.body.id)).toBe(true);

    const getModel = await makeZodVerifiedAPICall(
      GetModelV1Response,
      "GET",
      `/api/public/models/${customModel.body.id}`,
      undefined,
      auth,
    );
    expect(getModel.body.id).toBe(customModel.body.id);
    expect(getModel.body).toMatchObject({
      modelName: fixtureModelName,
      matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
      startDate: new Date("2023-12-01").toISOString(),
      inputPrice: 0.002,
      outputPrice: 0.004,
      unit: "TOKENS",
      tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
      isLangfuseManaged: false,
      prices: {
        input: { price: 0.002 },
        output: { price: 0.004 },
      },
    });

    const prices = await prisma.price.findMany({
      where: { modelId: customModel.body.id },
    });

    expect(prices.length).toBe(2);

    expect(prices.map((p) => ({ ...p, price: Number(p.price) }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          usageType: "input",
          price: 0.002,
        }),
        expect.objectContaining({
          usageType: "output",
          price: 0.004,
        }),
      ]),
    );
  });

  it("Post model with invalid matchPattern", async () => {
    const customModel = await makeAPICall(
      "POST",
      "/api/public/models",
      {
        modelName: fixtureModelName,
        matchPattern: "[][", // brackets not balanced
        startDate: "2023-12-01",
        inputPrice: 0.002,
        outputPrice: 0.004,
        unit: "TOKENS",
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
      },
      auth,
    );
    expect(customModel.status).toBe(400);
  });

  it("Post model with missing fields", async () => {
    const { status } = await makeAPICall(
      "POST",
      "/api/public/models",
      {
        modelName: fixtureModelName,
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        // missing unit
      },
      auth,
    );
    expect(status).toBe(400);
  });

  it("Post model with invalid price (input and total cost)", async () => {
    const customModel = await makeAPICall(
      "POST",
      "/api/public/models",
      {
        modelName: fixtureModelName,
        matchPattern: "[][", // brackets not balanced
        startDate: "2023-12-01",
        inputPrice: 0.002,
        outputPrice: 0.004,
        totalPrice: 0.1,
        unit: "TOKENS",
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
      },
      auth,
    );
    expect(customModel.status).toBe(400);
  });

  it("Cannot delete built-in models", async () => {
    const getBuiltInModel = await makeZodVerifiedAPICall(
      GetModelV1Response,
      "GET",
      `/api/public/models/${modelOneId}`,
      undefined,
      auth,
    );
    expect(getBuiltInModel.status).toBe(200);
    expect(getBuiltInModel.body.id).toBe(modelOneId);

    const deleteModel = await makeAPICall(
      "DELETE",
      `/api/public/models/${modelOneId}`,
      undefined,
      auth,
    );
    expect(deleteModel.status).toBe(404);
  });

  it("Delete custom model", async () => {
    const customModel = await makeZodVerifiedAPICall(
      PostModelsV1Response,
      "POST",
      "/api/public/models",
      {
        modelName: fixtureModelName,
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: "2023-12-01",
        inputPrice: 0.002,
        outputPrice: 0.004,
        unit: "TOKENS",
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
      },
      auth,
    );

    const createdModel = await makeZodVerifiedAPICall(
      GetModelV1Response,
      "GET",
      `/api/public/models/${customModel.body.id}`,
      undefined,
      auth,
    );
    expect(createdModel.status).toBe(200);
    expect(createdModel.body.id).toBe(customModel.body.id);

    await makeZodVerifiedAPICall(
      DeleteModelV1Response,
      "DELETE",
      `/api/public/models/${customModel.body.id}`,
      undefined,
      auth,
    );

    const deletedModel = await makeAPICall(
      "GET",
      `/api/public/models/${customModel.body.id}`,
      undefined,
      auth,
    );
    expect(deletedModel.status).toBe(404);

    const modelsAfterDelete = await makeAPICall(
      "GET",
      "/api/public/models",
      undefined,
      auth,
    );
    expect(modelsAfterDelete.status).toBe(200);
  });
});
