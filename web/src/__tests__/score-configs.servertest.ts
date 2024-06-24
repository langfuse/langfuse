/** @jest-environment node */

import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4 } from "uuid";
import { ScoreDataType, prisma } from "@langfuse/shared/src/db";
import { type CastedConfig } from "@langfuse/shared";

const CONFIG_ID_ONE = uuidv4();
const CONFIG_ID_TWO = uuidv4();
const CONFIG_ID_THREE = uuidv4();

const configOne = [
  {
    id: CONFIG_ID_ONE,
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
    id: CONFIG_ID_TWO,
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
    id: CONFIG_ID_THREE,
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
    const configId = CONFIG_ID_ONE;

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
});
