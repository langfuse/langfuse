/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { makeAPICall } from "@/src/__tests__/test-utils";
import { v4 as uuidv4, v4 } from "uuid";
import { type Prompt, PromptType } from "@langfuse/shared";
import {
  LegacyPromptSchema,
  type LegacyValidatedPrompt,
} from "@langfuse/shared";
import {
  createOrgProjectAndApiKey,
  getObservationById,
} from "@langfuse/shared/src/server";

describe("/api/public/prompts API Endpoint", () => {
  let auth: string;
  let projectId: string;
  const apiCall = (
    method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
    url: string,
    body?: unknown,
  ) => makeAPICall(method, url, body, auth);

  beforeEach(async () => {
    const setup = await createOrgProjectAndApiKey();
    auth = setup.auth;
    projectId = setup.projectId;
  });

  it("should fetch a prompt", async () => {
    const promptId = uuidv4();

    await prisma.prompt.create({
      data: {
        id: promptId,
        name: "prompt-name",
        prompt: "prompt",
        labels: ["production"],
        version: 1,
        config: {
          temperature: 0.1,
        },
        project: {
          connect: { id: projectId },
        },
        createdBy: "user-1",
      },
    });

    const fetchedObservations = await apiCall(
      "GET",
      "/api/public/prompts?name=prompt-name&version=1",
      undefined,
    );

    expect(fetchedObservations.status).toBe(200);

    if (!isPrompt(fetchedObservations.body)) {
      throw new Error("Expected body to be a prompt");
    }

    expect(fetchedObservations.body.id).toBe(promptId);
    expect(fetchedObservations.body.name).toBe("prompt-name");
    expect(fetchedObservations.body.prompt).toBe("prompt");
    expect(fetchedObservations.body.type).toBe("text");
    expect(fetchedObservations.body.version).toBe(1);
    expect(fetchedObservations.body.isActive).toBe(true);
    expect(fetchedObservations.body.labels).toEqual(["production"]);
    expect(fetchedObservations.body.createdBy).toBe("user-1");
    expect(fetchedObservations.body.config).toEqual({ temperature: 0.1 });
    expect(fetchedObservations.body.tags).toEqual([]);
  });

  it("should fetch a prompt with special character", async () => {
    const promptId = uuidv4();

    await prisma.prompt.create({
      data: {
        id: promptId,
        name: "prompt + name",
        prompt: "prompt",
        labels: ["production"],
        version: 1,
        config: {
          temperature: 0.1,
        },
        project: {
          connect: { id: projectId },
        },
        createdBy: "user-1",
      },
    });

    const fetchedObservations = await apiCall(
      "GET",
      `/api/public/prompts?name=${encodeURIComponent("prompt + name")}&version=1`,
      undefined,
    );

    expect(fetchedObservations.status).toBe(200);

    if (!isPrompt(fetchedObservations.body)) {
      throw new Error("Expected body to be a prompt");
    }

    expect(fetchedObservations.body.id).toBe(promptId);
    expect(fetchedObservations.body.name).toBe("prompt + name");
    expect(fetchedObservations.body.prompt).toBe("prompt");
    expect(fetchedObservations.body.type).toBe("text");
    expect(fetchedObservations.body.version).toBe(1);
    expect(fetchedObservations.body.isActive).toBe(true);
    expect(fetchedObservations.body.labels).toEqual(["production"]);
    expect(fetchedObservations.body.createdBy).toBe("user-1");
    expect(fetchedObservations.body.config).toEqual({ temperature: 0.1 });
    expect(fetchedObservations.body.tags).toEqual([]);
  });

  it("should fetch active prompt only if no prompt version is given", async () => {
    const promptId = uuidv4();

    await prisma.prompt.create({
      data: {
        id: promptId,
        name: "prompt-name",
        prompt: "prompt",
        labels: [],
        version: 1,
        config: {
          temperature: 0.1,
        },
        project: {
          connect: { id: projectId },
        },
        createdBy: "user-1",
      },
    });

    const fetchedObservations = await apiCall(
      "GET",
      "/api/public/prompts?name=prompt-name",
      undefined,
    );

    expect(fetchedObservations.status).toBe(404);
  });

  it("should fetch inactive prompt if prompt version is given", async () => {
    const promptId = uuidv4();
    const promptTwoId = uuidv4();

    await prisma.prompt.create({
      data: {
        id: promptId,
        name: "prompt-name",
        prompt: "prompt-one",
        labels: [],
        version: 1,
        config: {
          temperature: 0.1,
        },
        project: {
          connect: { id: projectId },
        },
        createdBy: "user-1",
      },
    });

    await prisma.prompt.create({
      data: {
        id: promptTwoId,
        name: "prompt-name",
        prompt: "prompt",
        labels: ["production"],
        version: 2,
        config: {
          temperature: 0.2,
        },
        project: {
          connect: { id: projectId },
        },
        createdBy: "user-1",
      },
    });

    const fetchedObservations = await apiCall(
      "GET",
      "/api/public/prompts?name=prompt-name&version=1",
      undefined,
    );

    expect(fetchedObservations.status).toBe(200);

    if (!isPrompt(fetchedObservations.body)) {
      throw new Error("Expected body to be a prompt");
    }

    expect(fetchedObservations.body.id).toBe(promptId);
    expect(fetchedObservations.body.name).toBe("prompt-name");
    expect(fetchedObservations.body.prompt).toBe("prompt-one");
    expect(fetchedObservations.body.version).toBe(1);
    expect(fetchedObservations.body.isActive).toBe(false);
    expect(fetchedObservations.body.labels).toEqual([]);
    expect(fetchedObservations.body.createdBy).toBe("user-1");
    expect(fetchedObservations.body.config).toEqual({ temperature: 0.1 });
  });

  it("should fetch active prompt when multiple exist", async () => {
    // First prompt is activated
    const prompt1 = await apiCall("POST", "/api/public/prompts", {
      name: "prompt-name",
      projectId,
      prompt: "prompt1",
      isActive: true,
      version: 1,
      config: {
        temperature: 0.1,
      },
      createdBy: "user-1",
    });

    // Second prompt also activated
    const prompt2 = await apiCall("POST", "/api/public/prompts", {
      name: "prompt-name",
      projectId,
      prompt: "prompt2",
      labels: ["production"],
      isActive: true,
      version: 2,
      config: {
        temperature: 0.2,
      },
      createdBy: "user-1",
    });

    // Third prompt is deactivated
    await apiCall("POST", "/api/public/prompts", {
      name: "prompt-name",
      projectId,
      prompt: "prompt3",
      labels: [], // This should be ignored
      isActive: false,
      version: 3,
      config: {
        temperature: 0.3,
      },
      createdBy: "user-1",
    });

    // Expect the second prompt to be fetched
    const fetchedProductionPrompt = await apiCall(
      "GET",
      "/api/public/prompts?name=prompt-name",
      undefined,
    );

    expect(fetchedProductionPrompt.status).toBe(200);

    if (!isPrompt(fetchedProductionPrompt.body)) {
      throw new Error("Expected body to be a prompt");
    }

    // @ts-expect-error
    expect(fetchedProductionPrompt.body.id).toBe(prompt2.body.id);
    expect(fetchedProductionPrompt.body.name).toBe("prompt-name");
    expect(fetchedProductionPrompt.body.prompt).toBe("prompt2");
    expect(fetchedProductionPrompt.body.type).toBe("text");
    expect(fetchedProductionPrompt.body.version).toBe(2);
    expect(fetchedProductionPrompt.body.isActive).toBe(true);
    expect(fetchedProductionPrompt.body.labels).toEqual(["production"]);
    expect(fetchedProductionPrompt.body.createdBy).toBe("API");
    expect(fetchedProductionPrompt.body.config).toEqual({ temperature: 0.2 });

    // Expect the first prompt to be deactivated
    const fetchedOldProductionPrompt = await apiCall(
      "GET",
      "/api/public/prompts?name=prompt-name&version=1",
      undefined,
    );

    expect(fetchedOldProductionPrompt.status).toBe(200);

    if (!isPrompt(fetchedOldProductionPrompt.body)) {
      throw new Error("Expected body to be a prompt");
    }

    // @ts-expect-error
    expect(fetchedOldProductionPrompt.body.id).toBe(prompt1.body.id);
    expect(fetchedOldProductionPrompt.body.name).toBe("prompt-name");
    expect(fetchedOldProductionPrompt.body.prompt).toBe("prompt1");
    expect(fetchedOldProductionPrompt.body.type).toBe("text");
    expect(fetchedOldProductionPrompt.body.version).toBe(1);
    expect(fetchedOldProductionPrompt.body.isActive).toBe(false);
    expect(fetchedOldProductionPrompt.body.labels).toEqual([]);
    expect(fetchedOldProductionPrompt.body.createdBy).toBe("API");
    expect(fetchedOldProductionPrompt.body.config).toEqual({
      temperature: 0.1,
    });
  });

  it("should correctly handle overwriting labels", async () => {
    // First prompt has multiple labels
    const prompt1 = await apiCall("POST", "/api/public/prompts", {
      name: "prompt-name",
      projectId,
      prompt: "prompt1",
      labels: ["production", "staging", "development"],
      isActive: true,
      version: 1,
      config: {
        temperature: 0.1,
      },
      createdBy: "user-1",
    });

    // Second prompt overwrites production and staging label
    const prompt2 = await apiCall("POST", "/api/public/prompts", {
      name: "prompt-name",
      projectId,
      prompt: "prompt2",
      labels: ["production", "production", "staging"], // Should be deduped
      isActive: true,
      version: 2,
      config: {
        temperature: 0.2,
      },
      createdBy: "user-1",
    });

    // Third prompt overwrites staging label
    const prompt3 = await apiCall("POST", "/api/public/prompts", {
      name: "prompt-name",
      projectId,
      prompt: "prompt3",
      labels: ["staging"],
      isActive: false,
      version: 3,
      config: {
        temperature: 0.3,
      },
      createdBy: "user-1",
    });

    // Expect the second prompt to be fetched as default production prompt
    const fetchedProductionPrompt = await apiCall(
      "GET",
      "/api/public/prompts?name=prompt-name",
      undefined,
    );
    expect(fetchedProductionPrompt.status).toBe(200);
    if (!isPrompt(fetchedProductionPrompt.body)) {
      throw new Error("Expected body to be a prompt");
    }
    // @ts-expect-error
    expect(fetchedProductionPrompt.body.id).toBe(prompt2.body.id);
    expect(fetchedProductionPrompt.body.labels).toEqual(["production"]); // Only production label should be present

    // Expect the first prompt to have only development label
    const fetchedFirstPrompt = await apiCall(
      "GET",
      "/api/public/prompts?name=prompt-name&version=1",
      undefined,
    );

    expect(fetchedFirstPrompt.status).toBe(200);
    if (!isPrompt(fetchedFirstPrompt.body)) {
      throw new Error("Expected body to be a prompt");
    }

    // @ts-expect-error
    expect(fetchedFirstPrompt.body.id).toBe(prompt1.body.id);
    expect(fetchedFirstPrompt.body.labels).toEqual(["development"]);

    // Expect the third prompt to have only staging label
    const fetchedThirdPrompt = await apiCall(
      "GET",
      "/api/public/prompts?name=prompt-name&version=3",
      undefined,
    );

    expect(fetchedThirdPrompt.status).toBe(200);
    if (!isPrompt(fetchedThirdPrompt.body)) {
      throw new Error("Expected body to be a prompt");
    }

    // @ts-expect-error
    expect(fetchedThirdPrompt.body.id).toBe(prompt3.body.id);
    expect(fetchedThirdPrompt.body.labels).toEqual(["staging", "latest"]);
  });

  it("should create and fetch a prompt", async () => {
    await apiCall("POST", "/api/public/prompts", {
      name: "prompt-name",
      prompt: "prompt",
      isActive: true,
      projectId,
      config: {
        temperature: 0.1,
      },
    });

    const fetchedObservations = await apiCall(
      "GET",
      "/api/public/prompts?name=prompt-name&version=1",
      undefined,
    );

    expect(fetchedObservations.status).toBe(200);

    if (!isPrompt(fetchedObservations.body)) {
      throw new Error("Expected body to be an array of observations");
    }

    expect(fetchedObservations.body.name).toBe("prompt-name");
    expect(fetchedObservations.body.prompt).toBe("prompt");
    expect(fetchedObservations.body.type).toBe("text");
    expect(fetchedObservations.body.version).toBe(1);
    expect(fetchedObservations.body.isActive).toBe(true);
    expect(fetchedObservations.body.labels).toEqual(["production", "latest"]);
    expect(fetchedObservations.body.createdBy).toBe("API");
    expect(fetchedObservations.body.config).toEqual({ temperature: 0.1 });
  });

  it("should relate generation to prompt", async () => {
    const traceId = v4();
    const generationId = v4();

    const promptId = uuidv4();

    await prisma.prompt.create({
      data: {
        id: promptId,
        name: "prompt-name",
        prompt: "prompt",
        labels: ["production"],
        version: 1,
        project: {
          connect: { id: projectId },
        },
        createdBy: "user-1",
      },
    });

    const response = await apiCall("POST", "/api/public/ingestion", {
      metadata: {
        sdk_verion: "1.0.0",
        sdk_name: "python",
      },
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
          },
        },
        {
          id: v4(),
          type: "generation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            traceId: traceId,
            type: "GENERATION",
            name: "generation-name",
            promptName: "prompt-name",
            promptVersion: 1,
          },
        },
      ],
    });

    expect(response.status).toBe(207);

    // Delay to allow for async processing
    await new Promise((resolve) => setTimeout(resolve, 500));

    const dbGeneration = await getObservationById({
      id: generationId,
      projectId,
    });

    expect(dbGeneration?.id).toBe(generationId);
    expect(dbGeneration?.promptId).toBe(promptId);
  });

  it("should fail if prompt version is missing", async () => {
    const traceId = v4();
    const generationId = v4();

    const promptId = uuidv4();

    await prisma.prompt.create({
      data: {
        id: promptId,
        name: "prompt-name",
        prompt: "prompt",
        labels: ["production"],
        version: 1,
        project: {
          connect: { id: projectId },
        },
        createdBy: "user-1",
      },
    });

    const response = await apiCall("POST", "/api/public/ingestion", {
      metadata: {
        sdk_verion: "1.0.0",
        sdk_name: "python",
      },
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
          },
        },
        {
          id: v4(),
          type: "generation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            traceId: traceId,
            type: "GENERATION",
            name: "generation-name",
            promptName: "prompt-name",
          },
        },
      ],
    });

    expect(response.status).toBe(207);

    expect(
      getObservationById({
        id: generationId,
        projectId,
      }),
    ).rejects.toThrow("not found");
  });

  it("should create empty object if no config is provided", async () => {
    await apiCall("POST", "/api/public/prompts", {
      name: "prompt-name",
      prompt: "prompt",
      isActive: true,
      projectId,
    });

    const fetchedObservations = await apiCall(
      "GET",
      "/api/public/prompts?name=prompt-name&version=1",
      undefined,
    );

    expect(fetchedObservations.status).toBe(200);

    if (!isPrompt(fetchedObservations.body)) {
      throw new Error("Expected body to be an array of observations");
    }

    expect(fetchedObservations.body.name).toBe("prompt-name");
    expect(fetchedObservations.body.prompt).toBe("prompt");
    expect(fetchedObservations.body.type).toBe("text");
    expect(fetchedObservations.body.version).toBe(1);
    expect(fetchedObservations.body.isActive).toBe(true);
    expect(fetchedObservations.body.labels).toEqual(["production", "latest"]);
    expect(fetchedObservations.body.createdBy).toBe("API");
    expect(fetchedObservations.body.config).toEqual({});
  });

  it("should create and fetch a chat prompt", async () => {
    const promptName = "prompt-name";
    const chatMessages = [
      { role: "system", content: "You are a bot" },
      { role: "user", content: "What's up?" },
    ];
    const response = await apiCall("POST", "/api/public/prompts", {
      name: promptName,
      prompt: chatMessages,
      type: "chat",
      isActive: true,
      projectId,
    });

    expect(response.status).toBe(201);

    const { body: fetchedPrompt } = await apiCall(
      "GET",
      `/api/public/prompts?name=${promptName}`,
      undefined,
    );

    const validatedPrompt = validatePrompt(fetchedPrompt);

    expect(validatedPrompt.name).toBe("prompt-name");
    expect(validatedPrompt.prompt).toEqual(chatMessages);
    expect(validatedPrompt.type).toBe("chat");
    expect(validatedPrompt.version).toBe(1);
    expect(validatedPrompt.isActive).toBe(true);
    expect(validatedPrompt.labels).toEqual(["production", "latest"]);
    expect(validatedPrompt.createdBy).toBe("API");
    expect(validatedPrompt.config).toEqual({});
  });

  it("should fail if chat prompt has string prompt", async () => {
    const promptName = "prompt-name";
    const response = await apiCall("POST", "/api/public/prompts", {
      name: promptName,
      prompt: "prompt",
      type: "chat",
      isActive: true,
      projectId,
    });

    expect(response.status).toBe(400);

    const { body, status } = await apiCall(
      "GET",
      `/api/public/prompts?name=${promptName}`,
      undefined,
    );
    expect(status).toBe(404);
    expect(body).toEqual({
      error: "LangfuseNotFoundError",
      message: "Prompt not found",
    });
  });

  it("should fail if chat prompt has incorrect messages format", async () => {
    const promptName = "prompt-name";
    const incorrectChatMessages = [
      { role: "system", content: "You are a bot" },
      { role: "user", message: "What's up?" },
    ];
    const response = await apiCall("POST", "/api/public/prompts", {
      name: promptName,
      prompt: incorrectChatMessages,
      type: "chat",
      isActive: true,
      projectId,
    });

    expect(response.status).toBe(400);

    const { body, status } = await apiCall(
      "GET",
      `/api/public/prompts?name=${promptName}`,
      undefined,
    );
    expect(status).toBe(404);
    expect(body).toEqual({
      error: "LangfuseNotFoundError",
      message: "Prompt not found",
    });
  });
  it("should fail if text prompt has message format", async () => {
    const promptName = "prompt-name";
    const response = await apiCall("POST", "/api/public/prompts", {
      name: promptName,
      prompt: [{ role: "system", content: "You are a bot" }],
      type: "text",
      isActive: true,
      projectId,
    });

    expect(response.status).toBe(400);

    const { body, status } = await apiCall(
      "GET",
      `/api/public/prompts?name=${promptName}`,
      undefined,
    );
    expect(status).toBe(404);
    expect(body).toEqual({
      error: "LangfuseNotFoundError",
      message: "Prompt not found",
    });
  });

  it("should fail if previous versions have different prompt type", async () => {
    // Create a chat prompt
    const promptName = "prompt-name";
    const chatMessages = [
      { role: "system", content: "You are a bot" },
      { role: "user", content: "What's up?" },
    ];
    const postResponse1 = await apiCall("POST", "/api/public/prompts", {
      name: promptName,
      prompt: chatMessages,
      type: "chat",
      isActive: true,
      projectId,
    });

    expect(postResponse1.status).toBe(201);

    // Try creating a text prompt with the same name
    const postResponse2 = await apiCall("POST", "/api/public/prompts", {
      name: promptName,
      prompt: "prompt",
      type: "text",
      isActive: true,
      version: 2,
      projectId,
    });

    expect(postResponse2.status).toBe(400);
    expect(postResponse2.body).toEqual({
      error: "InvalidRequestError",
      message:
        "Previous versions have different prompt type. Create a new prompt with a different name.",
    });

    // Check if the prompt is still the chat prompt
    const getResponse1 = await apiCall(
      "GET",
      `/api/public/prompts?name=${promptName}`,
      undefined,
    );
    expect(getResponse1.status).toBe(200);

    const validatedPrompt = validatePrompt(getResponse1.body);

    expect(validatedPrompt.name).toBe("prompt-name");
    expect(validatedPrompt.prompt).toEqual(chatMessages);
    expect(validatedPrompt.type).toBe("chat");
    expect(validatedPrompt.version).toBe(1);
    expect(validatedPrompt.isActive).toBe(true);
    expect(validatedPrompt.labels).toEqual(["production", "latest"]);
    expect(validatedPrompt.createdBy).toBe("API");
    expect(validatedPrompt.config).toEqual({});

    // Check that the text prompt has not been created
    const getResponse2 = await apiCall(
      "GET",
      `/api/public/prompts?name=${promptName}&version=2`,
      undefined,
    );
    expect(getResponse2.status).toBe(404);
    expect(getResponse2.body).toEqual({
      error: "LangfuseNotFoundError",
      message: "Prompt not found",
    });
  });
});

type PromptWithIsActive = Prompt & { isActive: boolean };

const isPrompt = (x: unknown): x is PromptWithIsActive => {
  if (typeof x !== "object" || x === null) return false;
  const prompt = x as PromptWithIsActive;
  return (
    typeof prompt.id === "string" &&
    typeof prompt.name === "string" &&
    typeof prompt.version === "number" &&
    typeof prompt.prompt === "string" &&
    typeof prompt.isActive === "boolean" &&
    typeof prompt.projectId === "string" &&
    typeof prompt.createdBy === "string" &&
    typeof prompt.config === "object" &&
    Object.values(PromptType).includes(prompt.type as PromptType)
  );
};

const validatePrompt = (
  obj: Record<string, unknown>,
): LegacyValidatedPrompt => {
  Object.keys(obj).forEach((key) => {
    obj[key] =
      key === "createdAt" || key === "updatedAt"
        ? new Date(obj[key] as string)
        : obj[key];
  });

  return LegacyPromptSchema.parse(obj);
};
