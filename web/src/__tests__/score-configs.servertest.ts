/** @jest-environment node */

import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import {
  type ScoreConfig,
  ScoreDataType,
  prisma,
} from "@langfuse/shared/src/db";
import { type CastedConfig } from "@langfuse/shared";

const configOne = [
  {
    projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    name: "Test Boolean Config",
    description: "Test Description",
    dataType: ScoreDataType.BOOLEAN,
    categories: [
      { label: "False", value: 0 },
      { label: "True", value: 1 },
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
    dataType: ScoreDataType.NUMERIC,
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
    dataType: ScoreDataType.CATEGORICAL,
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

    const getScoreConfig = await makeAPICall<{
      id: string;
    }>("GET", `/api/public/score-configs/${configId}`);

    expect(getScoreConfig.status).toBe(200);
    expect(getScoreConfig.body).toMatchObject({
      ...configOne[0],
      isArchived: false,
      createdAt: "2024-05-10T00:00:00.000Z",
      updatedAt: "2024-05-10T00:00:00.000Z",
    });
  });

  it("should GET all score configs", async () => {
    const fetchedConfigs = await makeAPICall<{
      data: CastedConfig[];
      meta: object;
    }>("GET", `/api/public/score-configs?limit=50&page=1`);

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

    const getScoreConfig = await makeAPICall<{
      message: string;
    }>("GET", `/api/public/score-configs/${configId}`);

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

    const getScoreConfig = await makeAPICall<{
      message: string;
    }>("GET", `/api/public/score-configs/${configId}`);

    expect(getScoreConfig.status).toBe(500);
    expect(getScoreConfig.body).toMatchObject({
      message: "Internal Server Error",
    });
  });

  it("should POST a numeric score config", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "numeric-config-name",
        dataType: ScoreDataType.NUMERIC,
        maxValue: 0,
      },
    );

    const dbScoreConfig = await prisma.scoreConfig.findMany({
      where: {
        name: "numeric-config-name",
      },
    });

    expect(postScoreConfig.status).toBe(201);
    expect(dbScoreConfig.length).toBeGreaterThan(0);
    expect(dbScoreConfig[0]?.name).toBe("numeric-config-name");
    expect(dbScoreConfig[0]?.dataType).toBe(ScoreDataType.NUMERIC);
    expect(dbScoreConfig[0]?.maxValue).toBe(0);
  });

  it("should POST a boolean score config", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "boolean-config-name",
        dataType: ScoreDataType.BOOLEAN,
      },
    );

    const dbScoreConfig = await prisma.scoreConfig.findMany({
      where: {
        name: "boolean-config-name",
      },
    });

    expect(postScoreConfig.status).toBe(201);
    expect(dbScoreConfig.length).toBeGreaterThan(0);
    expect(dbScoreConfig[0]?.name).toBe("boolean-config-name");
    expect(dbScoreConfig[0]?.dataType).toBe(ScoreDataType.BOOLEAN);
    expect(dbScoreConfig[0]?.categories).toStrictEqual([
      { label: "True", value: 1 },
      { label: "False", value: 0 },
    ]);
  });

  it("should POST a categorical score config", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "categorical-config-name",
        dataType: ScoreDataType.CATEGORICAL,
        categories: [
          { label: "Good", value: 1 },
          { label: "Bad", value: 0 },
        ],
      },
    );

    const dbScoreConfig = await prisma.scoreConfig.findMany({
      where: {
        name: "categorical-config-name",
      },
    });

    expect(postScoreConfig.status).toBe(201);
    expect(dbScoreConfig.length).toBeGreaterThan(0);
    expect(dbScoreConfig[0]?.name).toBe("categorical-config-name");
    expect(dbScoreConfig[0]?.dataType).toBe(ScoreDataType.CATEGORICAL);
    expect(dbScoreConfig[0]?.categories).toStrictEqual([
      { label: "Good", value: 1 },
      { label: "Bad", value: 0 },
    ]);
  });

  it("should fail POST of numeric score config with invalid range", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "invalid-numeric-config-name",
        dataType: ScoreDataType.NUMERIC,
        maxValue: 0,
        minValue: 1,
      },
    );

    expect(postScoreConfig.status).toBe(400);
    expect(postScoreConfig.body).toMatchObject({
      message: "Invalid request data",
      error: "Maximum value must be greater than Minimum value.",
    });
  });

  it("should fail POST of boolean score config with custom categories", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "invalid-boolean-config-name",
        dataType: ScoreDataType.BOOLEAN,
        categories: [
          { label: "Good", value: 1 },
          { label: "Bad", value: 0 },
        ],
      },
    );

    expect(postScoreConfig.status).toBe(400);
    expect(postScoreConfig.body).toMatchObject({
      message: "Invalid request data",
      error:
        "Custom categories are only allowed for categorical data types and will be autogenerated for boolean data types.",
    });
  });

  it("should fail POST of categorical score config with NO custom categories", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "invalid-categorical-config-name",
        dataType: ScoreDataType.CATEGORICAL,
      },
    );

    expect(postScoreConfig.status).toBe(400);
    expect(postScoreConfig.body).toMatchObject({
      message: "Invalid request data",
      error: "At least one category is required for categorical data types.",
    });
  });

  it("should fail POST of categorical score config with invalid custom categories format", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "invalid-categorical-config-name",
        dataType: ScoreDataType.CATEGORICAL,
        categories: [
          { key: "first", value: 1 },
          { key: "second", value: 0 },
        ],
      },
    );

    expect(postScoreConfig.status).toBe(400);
    expect(postScoreConfig.body).toMatchObject({
      message: "Invalid request data",
      error:
        "Invalid categories format, must be an array of objects with label and value keys.",
    });
  });

  it("should fail POST of categorical score config with duplicated category label", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "invalid-categorical-config-name",
        dataType: ScoreDataType.CATEGORICAL,
        categories: [
          { label: "first", value: 1 },
          { label: "first", value: 0 },
        ],
      },
    );

    expect(postScoreConfig.status).toBe(400);
    expect(postScoreConfig.body).toMatchObject({
      message: "Invalid request data",
      error: "Category names must be unique.",
    });
  });

  it("should fail POST of categorical score config with duplicated category value", async () => {
    const postScoreConfig = await makeAPICall(
      "POST",
      "/api/public/score-configs",
      {
        name: "invalid-categorical-config-name",
        dataType: ScoreDataType.CATEGORICAL,
        categories: [
          { label: "first", value: 1 },
          { label: "second", value: 1 },
        ],
      },
    );

    expect(postScoreConfig.status).toBe(400);
    expect(postScoreConfig.body).toMatchObject({
      message: "Invalid request data",
      error: "Category values must be unique.",
    });
  });
});
