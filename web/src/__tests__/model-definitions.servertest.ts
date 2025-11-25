/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import {
  DeleteModelV1Response,
  GetModelV1Response,
  GetModelsV1Response,
  PostModelsV1Response,
} from "@/src/features/public-api/types/models";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

describe("/models API Endpoints", () => {
  let auth: string;

  beforeEach(async () => {
    await pruneDatabase();

    // Create authentication pairs
    const { auth: newAuth } = await createOrgProjectAndApiKey();
    auth = newAuth;

    // create some default models that do not belong to a project
    await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0010",
        outputPrice: "0.0020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: new Date("2023-12-02"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: "TOKENS",
      },
    });
    await prisma.price.createMany({
      data: [
        {
          modelId: "model-1",
          projectId: null,
          usageType: "input",
          price: 0.001,
        },
        {
          modelId: "model-1",
          projectId: null,
          usageType: "output",
          price: 0.002,
        },
        { modelId: "model-1", projectId: null, usageType: "total", price: 0.1 },
      ],
    });
    await prisma.model.create({
      data: {
        id: "model-2",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0020",
        outputPrice: "0.0040",
        totalPrice: undefined,
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: new Date("2023-12-01"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: "TOKENS",
      },
    });
    await prisma.price.createMany({
      data: [
        {
          modelId: "model-2",
          projectId: null,
          usageType: "input",
          price: 0.02,
        },
        {
          modelId: "model-2",
          projectId: null,
          usageType: "output",
          price: 0.04,
        },
      ],
    });
  });
  afterEach(async () => await pruneDatabase());

  it("GET /models", async () => {
    const models = await makeZodVerifiedAPICall(
      GetModelsV1Response,
      "GET",
      "/api/public/models",
      undefined,
      auth,
    );
    expect(models.status).toBe(200);
    expect(models.body.data.length).toBe(2);
    expect(models.body.data[0]).toMatchObject({
      isLangfuseManaged: true,
      modelName: "gpt-3.5-turbo",
      prices: {
        input: { price: 0.001 },
        output: { price: 0.002 },
        total: { price: 0.1 },
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
    expect(models.body.meta).toMatchObject({
      page: 2,
      totalPages: 2,
      limit: 1,
      totalItems: 2,
    });
  });

  it("Create and get custom model", async () => {
    const customModel = await makeZodVerifiedAPICall(
      PostModelsV1Response,
      "POST",
      "/api/public/models",
      {
        modelName: "gpt-3.5-turbo",
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
    expect(models.body.data.length).toBe(3);

    const getModel = await makeZodVerifiedAPICall(
      GetModelV1Response,
      "GET",
      `/api/public/models/${customModel.body.id}`,
      undefined,
      auth,
    );
    expect(getModel.body.id).toBe(customModel.body.id);
    expect(getModel.body).toMatchObject({
      modelName: "gpt-3.5-turbo",
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
        modelName: "gpt-3.5-turbo",
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

  it("Post model without prices or tokenizer", async () => {
    await makeZodVerifiedAPICall(
      PostModelsV1Response,
      "POST",
      "/api/public/models",
      {
        modelName: "gpt-3.5-turbo",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        unit: "TOKENS",
      },
      auth,
    );
  });

  it("Post model with missing fields", async () => {
    const { status } = await makeAPICall(
      "POST",
      "/api/public/models",
      {
        modelName: "gpt-3.5-turbo",
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
        modelName: "gpt-3.5-turbo",
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
    const models = await makeZodVerifiedAPICall(
      GetModelsV1Response,
      "GET",
      "/api/public/models",
      undefined,
      auth,
    );
    expect(models.body.data.length).toBe(2);

    const deleteModel = await makeAPICall(
      "DELETE",
      `/api/public/models/${models.body.data[0].id}`,
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
        modelName: "gpt-3.5-turbo",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: "2023-12-01",
        inputPrice: 0.002,
        outputPrice: 0.004,
        unit: "TOKENS",
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
      },
      auth,
    );

    const models = await makeZodVerifiedAPICall(
      GetModelsV1Response,
      "GET",
      "/api/public/models",
      undefined,
      auth,
    );
    expect(models.body.data.length).toBe(3);

    await makeZodVerifiedAPICall(
      DeleteModelV1Response,
      "DELETE",
      `/api/public/models/${customModel.body.id}`,
      undefined,
      auth,
    );

    const modelsAfterDelete = await makeZodVerifiedAPICall(
      GetModelsV1Response,
      "GET",
      "/api/public/models",
      undefined,
      auth,
    );
    expect(modelsAfterDelete.body.data.length).toBe(2);
  });
});
