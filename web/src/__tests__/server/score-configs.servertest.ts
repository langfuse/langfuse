/** @jest-environment node */

import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  GetScoreConfigResponse,
  GetScoreConfigsResponse,
  PostScoreConfigResponse,
  PutScoreConfigResponse,
} from "@/src/features/public-api/types/score-configs";
import { ScoreConfigDataType } from "@langfuse/shared";
import { type ScoreConfig, prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const configOne = [
  {
    projectId: "",
    name: "Test Boolean Config",
    description: "Test Description",
    dataType: ScoreConfigDataType.BOOLEAN,
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
    projectId: "",
    name: "Test Numeric Config",
    description: "Test Description",
    dataType: ScoreConfigDataType.NUMERIC,
    minValue: 0,
    createdAt: new Date("2024-05-11T00:00:00.000Z"),
    updatedAt: new Date("2024-05-11T00:00:00.000Z"),
  },
];

const configThree = [
  {
    projectId: "",
    name: "Test Categorical Config",
    description: "Test Description",
    dataType: ScoreConfigDataType.CATEGORICAL,
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
  let auth: string;
  let projectId: string;

  beforeEach(async () => {
    const { auth: newAuth, projectId: newProjectId } =
      await createOrgProjectAndApiKey();
    auth = newAuth;
    projectId = newProjectId;

    // Update the project IDs in configs to use the new project ID
    configOne[0].projectId = projectId;
    configTwo[0].projectId = projectId;
    configThree[0].projectId = projectId;

    await prisma.scoreConfig.createMany({
      data: [...configOne, ...configTwo, ...configThree],
    });
  });

  it("should GET a score config", async () => {
    const { id: configId } = (await prisma.scoreConfig.findFirst({
      where: {
        projectId,
        name: configOne[0].name,
      },
    })) as ScoreConfig;

    const getScoreConfig = await makeZodVerifiedAPICall(
      GetScoreConfigResponse,
      "GET",
      `/api/public/score-configs/${configId}`,
      undefined,
      auth,
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
      undefined,
      auth,
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
      undefined,
      auth,
    );

    expect(getScoreConfig.status).toBe(404);
    expect(getScoreConfig.body).toMatchObject({
      message: "Score config not found within authorized project",
    });
  });

  it("should return 500 when hitting corrupted score config", async () => {
    const configId = v4();

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
      undefined,
      auth,
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
      auth,
    );

    const scoreConfig = await makeZodVerifiedAPICall(
      GetScoreConfigResponse,
      "GET",
      `/api/public/score-configs/${postScoreConfig.body.id}`,
      undefined,
      auth,
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
      auth,
    );

    const scoreConfig = await makeZodVerifiedAPICall(
      GetScoreConfigResponse,
      "GET",
      `/api/public/score-configs/${postScoreConfig.body.id}`,
      undefined,
      auth,
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
      auth,
    );

    const scoreConfig = await makeZodVerifiedAPICall(
      GetScoreConfigResponse,
      "GET",
      `/api/public/score-configs/${postScoreConfig.body.id}`,
      undefined,
      auth,
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
        auth,
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
      auth,
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
      auth,
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
      auth,
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
      auth,
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
      auth,
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

  describe("PATCH /api/public/score-configs/:configId", () => {
    it("should successfully archive a score config", async () => {
      const { id: configId } = (await prisma.scoreConfig.findFirst({
        where: {
          projectId,
          name: configOne[0].name,
        },
      })) as ScoreConfig;

      const patchResponse = await makeZodVerifiedAPICall(
        PutScoreConfigResponse,
        "PATCH",
        `/api/public/score-configs/${configId}`,
        {
          isArchived: true,
        },
        auth,
      );

      expect(patchResponse.status).toBe(200);
      expect(patchResponse.body.isArchived).toBe(true);
    });

    it("should fail when trying to update with invalid data type mismatch - numeric to categorical", async () => {
      const foundConfig = await prisma.scoreConfig.findFirst({
        where: {
          projectId,
          name: configTwo[0].name, // Numeric config
        },
      });
      const { id: configId } = foundConfig as ScoreConfig;

      const patchResponse = await makeAPICall(
        "PATCH",
        `/api/public/score-configs/${configId}`,
        {
          categories: [
            { label: "Good", value: 1 },
            { label: "Bad", value: 0 },
          ],
        },
        auth,
      );

      expect(patchResponse.status).toBe(400);
      expect(patchResponse.body).toMatchObject({
        message: expect.stringContaining("Invalid input"),
      });
    });

    it("should fail when trying to update boolean with custom categories", async () => {
      const { id: configId } = (await prisma.scoreConfig.findFirst({
        where: {
          projectId,
          name: configOne[0].name, // Boolean config
        },
      })) as ScoreConfig;

      const patchResponse = await makeAPICall(
        "PATCH",
        `/api/public/score-configs/${configId}`,
        {
          categories: [
            { label: "Custom Good", value: 1 },
            { label: "Custom Bad", value: 0 },
          ],
        },
        auth,
      );

      expect(patchResponse.status).toBe(400);
      expect(patchResponse.body).toMatchObject({
        message: expect.stringContaining("Invalid input"),
      });
    });

    it("should fail when trying to update with invalid numeric range", async () => {
      const { id: configId } = (await prisma.scoreConfig.findFirst({
        where: {
          projectId,
          name: configTwo[0].name, // Numeric config
        },
      })) as ScoreConfig;

      const patchResponse = await makeAPICall(
        "PATCH",
        `/api/public/score-configs/${configId}`,
        {
          minValue: 100,
          maxValue: 50,
        },
        auth,
      );

      expect(patchResponse.status).toBe(400);
      expect(patchResponse.body).toMatchObject({
        message: expect.stringContaining(
          "Maximum value must be greater than Minimum value",
        ),
      });
    });

    it("should fail when trying to update with invalid name length", async () => {
      const { id: configId } = (await prisma.scoreConfig.findFirst({
        where: {
          projectId,
          name: configTwo[0].name,
        },
      })) as ScoreConfig;

      const patchResponse = await makeAPICall(
        "PATCH",
        `/api/public/score-configs/${configId}`,
        {
          name: "a".repeat(50), // Exceeds 35 character limit
        },
        auth,
      );

      expect(patchResponse.status).toBe(400);
      expect(patchResponse.body).toMatchObject({
        message: expect.stringContaining("Invalid request"),
      });
    });

    it("should fail when trying to update with empty name", async () => {
      const { id: configId } = (await prisma.scoreConfig.findFirst({
        where: {
          projectId,
          name: configTwo[0].name,
        },
      })) as ScoreConfig;

      const patchResponse = await makeAPICall(
        "PATCH",
        `/api/public/score-configs/${configId}`,
        {
          name: "",
        },
        auth,
      );

      expect(patchResponse.status).toBe(400);
      expect(patchResponse.body).toMatchObject({
        message: expect.stringContaining("Invalid request"),
      });
    });

    it("should fail when trying to update non-existent config", async () => {
      const nonExistentId = "non-existent-config-id";

      const patchResponse = await makeAPICall(
        "PATCH",
        `/api/public/score-configs/${nonExistentId}`,
        {
          name: "Updated Name",
        },
        auth,
      );

      expect(patchResponse.status).toBe(404);
      expect(patchResponse.body).toMatchObject({
        message: "Score config not found within authorized project",
      });
    });

    it("should successfully update only specific fields without affecting others", async () => {
      const { id: configId } = (await prisma.scoreConfig.findFirst({
        where: {
          projectId,
          name: configTwo[0].name,
        },
      })) as ScoreConfig;

      // Get current config state
      const beforePatch = await makeZodVerifiedAPICall(
        GetScoreConfigResponse,
        "GET",
        `/api/public/score-configs/${configId}`,
        undefined,
        auth,
      );

      // Update only description
      const patchResponse = await makeZodVerifiedAPICall(
        PutScoreConfigResponse,
        "PATCH",
        `/api/public/score-configs/${configId}`,
        {
          description: "Only description updated",
        },
        auth,
      );

      expect(patchResponse.status).toBe(200);
      expect(patchResponse.body.description).toBe("Only description updated");
      // Verify other fields remain unchanged
      expect(patchResponse.body.name).toBe(beforePatch.body.name);
      expect(patchResponse.body.dataType).toBe(beforePatch.body.dataType);
      expect(patchResponse.body.minValue).toBe(beforePatch.body.minValue);
    });

    it("should fail when trying to update with empty body", async () => {
      const { id: configId } = (await prisma.scoreConfig.findFirst({
        where: {
          projectId,
          name: configTwo[0].name,
        },
      })) as ScoreConfig;

      const patchResponse = await makeAPICall(
        "PATCH",
        `/api/public/score-configs/${configId}`,
        {},
        auth,
      );

      expect(patchResponse.status).toBe(400);
      expect(patchResponse.body).toMatchObject({
        message: expect.stringContaining("Invalid request"),
      });
    });

    it("should successfully update a numeric score config", async () => {
      const { id: configId } = (await prisma.scoreConfig.findFirst({
        where: {
          projectId,
          name: configTwo[0].name, // "Test Numeric Config"
        },
      })) as ScoreConfig;

      const patchResponse = await makeZodVerifiedAPICall(
        PutScoreConfigResponse,
        "PATCH",
        `/api/public/score-configs/${configId}`,
        {
          name: "Updated Numeric Config",
          minValue: 5,
          maxValue: 100,
          description: "Updated description",
        },
        auth,
      );

      expect(patchResponse.status).toBe(200);
      expect(patchResponse.body).toMatchObject({
        id: configId,
        name: "Updated Numeric Config",
        dataType: "NUMERIC",
        minValue: 5,
        maxValue: 100,
        description: "Updated description",
      });

      // Verify the update persisted
      const getResponse = await makeZodVerifiedAPICall(
        GetScoreConfigResponse,
        "GET",
        `/api/public/score-configs/${configId}`,
        undefined,
        auth,
      );

      expect(getResponse.body.name).toBe("Updated Numeric Config");
      expect(getResponse.body.minValue).toBe(5);
      expect(getResponse.body.maxValue).toBe(100);
    });

    it("should successfully update a categorical score config", async () => {
      const { id: configId } = (await prisma.scoreConfig.findFirst({
        where: {
          projectId,
          name: configThree[0].name, // "Test Categorical Config"
        },
      })) as ScoreConfig;

      const patchResponse = await makeZodVerifiedAPICall(
        PutScoreConfigResponse,
        "PATCH",
        `/api/public/score-configs/${configId}`,
        {
          name: "Updated Categorical Config",
          categories: [
            { label: "Excellent", value: 3 },
            { label: "Good", value: 2 },
            { label: "Poor", value: 1 },
          ],
        },
        auth,
      );

      expect(patchResponse.status).toBe(200);
      expect(patchResponse.body).toMatchObject({
        id: configId,
        name: "Updated Categorical Config",
        dataType: "CATEGORICAL",
        categories: [
          { label: "Excellent", value: 3 },
          { label: "Good", value: 2 },
          { label: "Poor", value: 1 },
        ],
      });
    });

    it("should successfully update a boolean score config", async () => {
      const { id: configId } = (await prisma.scoreConfig.findFirst({
        where: {
          projectId,
          name: configOne[0].name, // "Test Boolean Config"
        },
      })) as ScoreConfig;

      const patchResponse = await makeZodVerifiedAPICall(
        PutScoreConfigResponse,
        "PATCH",
        `/api/public/score-configs/${configId}`,
        {
          name: "Updated Boolean Config",
          description: "Updated boolean description",
        },
        auth,
      );

      expect(patchResponse.status).toBe(200);
      expect(patchResponse.body).toMatchObject({
        id: configId,
        name: "Updated Boolean Config",
        dataType: "BOOLEAN",
        description: "Updated boolean description",
        categories: [
          { label: "True", value: 1 },
          { label: "False", value: 0 },
        ],
      });
    });
  });
});
