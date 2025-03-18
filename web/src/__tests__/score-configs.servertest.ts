/** @jest-environment node */

import {
  makeAPICall,
  makeZodVerifiedAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import {
  type ScoreConfig,
  prisma,
  type ScoreDataType,
} from "@langfuse/shared/src/db";
import {
  GetScoreConfigResponse,
  PostScoreConfigResponse,
  GetScoreConfigsResponse,
} from "@langfuse/shared";

const configOne = [
  {
    projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    name: "Test Boolean Config",
    description: "Test Description",
    dataType: "BOOLEAN" as ScoreDataType,
    categories: [
      { label: "True", value: 1 },
      { label: "False", value: 0 },
    ],
    createdAt: new Date("2024-05-10T00:00:00.000Z"),
    updatedAt: new Date("2024-05-10T00:00:00.000Z"),
  },
];
const configTwo = [
  {
    projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    name: "Test Numeric Config",
    description: "Test Description",
    dataType: "NUMERIC" as ScoreDataType,
    minValue: 0,
    createdAt: new Date("2024-05-11T00:00:00.000Z"),
    updatedAt: new Date("2024-05-11T00:00:00.000Z"),
  },
];

const configThree = [
  {
    projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    name: "Test Categorical Config",
    description: "Test Description",
    dataType: "CATEGORICAL" as ScoreDataType,
    categories: [
      { label: "A", value: 0 },
      { label: "B", value: 1 },
      { label: "C", value: 2 },
    ],
    createdAt: new Date("2024-05-11T00:00:00.000Z"),
    updatedAt: new Date("2024-05-11T00:00:00.000Z"),
  },
];

describe("/api/public/score-configs API Endpoint", () => {
  beforeAll(
    async () => {
      await pruneDatabase();

      await prisma.scoreConfig.createMany({
        data: [...configOne, ...configTwo, ...configThree],
      });
    },
    afterAll(async () => {
      await pruneDatabase();
    }),
  );

  it("should GET a score config", async () => {
    const { id: configId } = (await prisma.scoreConfig.findFirst({
      where: {
        projectId: configOne[0].projectId,
        name: configOne[0].name,
      },
    })) as ScoreConfig;

    const getScoreConfig = await makeZodVerifiedAPICall(
      GetScoreConfigResponse,
      "GET",
      `/api/public/score-configs/${configId}`,
    );

    expect(getScoreConfig.status).toBe(200);
    expect(getScoreConfig.body).toMatchObject({
      ...configOne[0],
      isArchived: false,
      createdAt: "2024-05-10T00:00:00.000Z",
      updatedAt: "2024-05-10T00:00:00.000Z",
    });
  });

  it("should GET all score configs", async () => {
    const fetchedConfigs = await makeZodVerifiedAPICall(
      GetScoreConfigsResponse,
      "GET",
      `/api/public/score-configs?limit=50&page=1`,
    );

    expect(fetchedConfigs.status).toBe(200);
    expect(fetchedConfigs.body.meta).toMatchObject({
      page: 1,
      limit: 50,
      totalItems: 3,
      totalPages: 1,
    });

    expect(fetchedConfigs.body.data.length).toBe(3);
    expect(fetchedConfigs.body.data[0]).toMatchObject({
      ...configTwo[0],
      isArchived: false,
      createdAt: "2024-05-11T00:00:00.000Z",
      updatedAt: "2024-05-11T00:00:00.000Z",
    });
  });

  it("test invalid config id input", async () => {
    const configId = "invalid-config-id";

    const getScoreConfig = await makeAPICall(
      "GET",
      `/api/public/score-configs/${configId}`,
    );

    expect(getScoreConfig.status).toBe(404);
    expect(getScoreConfig.body).toMatchObject({
      message: "Score config not found within authorized project",
    });
  });

  it("should return 500 when hitting corrupted score config", async () => {
    const configId = "corrupted-config-id";

    await prisma.scoreConfig.create({
      data: {
        ...configThree[0],
        id: configId,
        categories: "invalid-categories",
      },
    });

    const getScoreConfig = await makeAPICall(
      "GET",
      `/api/public/score-configs/${configId}`,
    );

    expect(getScoreConfig.status).toBe(500);
    expect(getScoreConfig.body).toMatchObject({
      message: "Requested score config is corrupted",
    });
  });

  it("should POST a numeric score config", async () => {
    const postScoreConfig = await makeZodVerifiedAPICall(
      PostScoreConfigResponse,
      "POST",
      "/api/public/score-configs",
      {
        name: "numeric-config-name",
        dataType: "NUMERIC",
        maxValue: 0,
      },
    );

    const scoreConfig = await makeZodVerifiedAPICall(
      GetScoreConfigResponse,
      "GET",
      `/api/public/score-configs/${postScoreConfig.body.id}`,
    );

    expect(postScoreConfig.status).toBe(200);
    expect(scoreConfig.body.name).toBe("numeric-config-name");
    expect(scoreConfig.body.dataType).toBe("NUMERIC");
    expect(scoreConfig.body.maxValue).toBe(0);
  });

  it("should POST a boolean score config", async () => {
    const postScoreConfig = await makeZodVerifiedAPICall(
      PostScoreConfigResponse,
      "POST",
      "/api/public/score-configs",
      {
        name: "boolean-config-name",
        dataType: "BOOLEAN",
      },
    );

    const scoreConfig = await makeZodVerifiedAPICall(
      GetScoreConfigResponse,
      "GET",
      `/api/public/score-configs/${postScoreConfig.body.id}`,
    );

    expect(postScoreConfig.status).toBe(200);
    expect(scoreConfig.body.name).toBe("boolean-config-name");
    expect(scoreConfig.body.dataType).toBe("BOOLEAN");
    expect(scoreConfig.body.categories).toEqual([
      { label: "True", value: 1 },
      { label: "False", value: 0 },
    ]);
  });

  it("should POST a categorical score config", async () => {
    const postScoreConfig = await makeZodVerifiedAPICall(
      PostScoreConfigResponse,
      "POST",
      "/api/public/score-configs",
      {
        name: "categorical-config-name",
        dataType: "CATEGORICAL",
        categories: [
          { label: "Good", value: 1 },
          { label: "Bad", value: 0 },
        ],
      },
    );

    const scoreConfig = await makeZodVerifiedAPICall(
      GetScoreConfigResponse,
      "GET",
      `/api/public/score-configs/${postScoreConfig.body.id}`,
    );

    expect(postScoreConfig.status).toBe(200);
    expect(scoreConfig.body.name).toBe("categorical-config-name");
    expect(scoreConfig.body.dataType).toBe("CATEGORICAL");
    expect(scoreConfig.body.categories).toEqual([
      { label: "Good", value: 1 },
      { label: "Bad", value: 0 },
    ]);
  });

  it("should fail POST of numeric score config with invalid range", async () => {
    try {
      await makeZodVerifiedAPICall(
        PostScoreConfigResponse,
        "POST",
        "/api/public/score-configs",
        {
          name: "invalid-numeric-config-name",
          dataType: "NUMERIC",
          maxValue: 0,
          minValue: 1,
        },
      );
    } catch (error) {
      expect((error as Error).message).toBe(
        `API call did not return 200, returned status 400, body {\"message\":\"Invalid request data\",\"error\":[{\"code\":\"custom\",\"message\":\"Maximum value must be greater than Minimum value\",\"path\":[]}]}`,
      );
    }
  });

  it("should fail POST of boolean score config with custom categories", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "invalid-boolean-config-name",
        dataType: "BOOLEAN",
        categories: [
          { label: "Good", value: 1 },
          { label: "Bad", value: 0 },
        ],
      },
    );

    expect(postScoreConfig.status).toBe(400);
    expect(postScoreConfig.body).toMatchObject({
      message: "Invalid request data",
    });
  });

  it("should fail POST of categorical score config with NO custom categories", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "invalid-categorical-config-name",
        dataType: "CATEGORICAL",
      },
    );

    expect(postScoreConfig.status).toBe(400);
    expect(postScoreConfig.body).toMatchObject({
      message: "Invalid request data",
    });
  });

  it("should fail POST of categorical score config with invalid custom categories format", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "invalid-categorical-config-name",
        dataType: "CATEGORICAL",
        categories: [
          { key: "first", value: 1 },
          { key: "second", value: 0 },
        ],
      },
    );

    expect(postScoreConfig.status).toBe(400);
    expect(postScoreConfig.body).toMatchObject({
      message: "Invalid request data",
      error: [
        {
          code: "custom",
          message:
            "Category must be an array of objects with label value pairs, where labels and values are unique.",
          path: ["categories"],
        },
      ],
    });
  });

  it("should fail POST of categorical score config with duplicated category label", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "invalid-categorical-config-name",
        dataType: "CATEGORICAL",
        categories: [
          { label: "first", value: 1 },
          { label: "first", value: 0 },
        ],
      },
    );

    expect(postScoreConfig.status).toBe(400);
    expect(postScoreConfig.body).toMatchObject({
      message: "Invalid request data",
      error: [
        {
          code: "custom",
          message:
            "Duplicate category label: first, category labels must be unique",
          path: ["categories"],
        },
      ],
    });
  });

  it("should fail POST of categorical score config with duplicated category value", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "invalid-categorical-config-name",
        dataType: "CATEGORICAL",
        categories: [
          { label: "first", value: 1 },
          { label: "second", value: 1 },
        ],
      },
    );

    expect(postScoreConfig.status).toBe(400);
    expect(postScoreConfig.body).toMatchObject({
      message: "Invalid request data",
      error: [
        {
          code: "custom",
          message:
            "Duplicate category value: 1, category values must be unique",
          path: ["categories"],
        },
      ],
    });
  });
});
