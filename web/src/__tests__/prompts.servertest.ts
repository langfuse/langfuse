/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4, v4 } from "uuid";
import { type Prompt } from "@langfuse/shared";
import {
  PromptSchema,
  PromptType,
  type ValidatedPrompt,
} from "@/src/features/prompts/server/validation";

describe("/api/public/prompts API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());

  it("should fetch a prompt", async () => {
    const promptId = uuidv4();

    await prisma.prompt.create({
      data: {
        id: promptId,
        name: "prompt-name",
        prompt: "prompt",
        isActive: true,
        version: 1,
        config: {
          temperature: 0.1,
        },
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        createdBy: "user-1",
      },
    });

    const fetchedObservations = await makeAPICall(
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
        isActive: true,
        version: 1,
        config: {
          temperature: 0.1,
        },
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        createdBy: "user-1",
      },
    });

    const fetchedObservations = await makeAPICall(
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
        isActive: false,
        version: 1,
        config: {
          temperature: 0.1,
        },
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        createdBy: "user-1",
      },
    });

    const fetchedObservations = await makeAPICall(
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
        isActive: false,
        version: 1,
        config: {
          temperature: 0.1,
        },
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        createdBy: "user-1",
      },
    });

    await prisma.prompt.create({
      data: {
        id: promptTwoId,
        name: "prompt-name",
        prompt: "prompt",
        isActive: true,
        version: 2,
        config: {
          temperature: 0.2,
        },
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        createdBy: "user-1",
      },
    });

    const fetchedObservations = await makeAPICall(
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
    expect(fetchedObservations.body.createdBy).toBe("user-1");
    expect(fetchedObservations.body.config).toEqual({ temperature: 0.1 });
  });

  it("should fetch active prompt when multiple exist", async () => {
    const promptIdOne = uuidv4();
    const promptIdTwo = uuidv4();

    await prisma.prompt.create({
      data: {
        id: promptIdOne,
        name: "prompt-name",
        prompt: "prompt",
        isActive: false,
        version: 1,
        config: {
          temperature: 0.1,
        },
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        createdBy: "user-1",
      },
    });

    await prisma.prompt.create({
      data: {
        id: promptIdTwo,
        name: "prompt-name",
        prompt: "prompt",
        isActive: true,
        version: 2,
        config: {
          temperature: 0.2,
        },
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        createdBy: "user-1",
      },
    });

    const fetchedObservations = await makeAPICall(
      "GET",
      "/api/public/prompts?name=prompt-name",
      undefined,
    );

    expect(fetchedObservations.status).toBe(200);

    if (!isPrompt(fetchedObservations.body)) {
      throw new Error("Expected body to be a prompt");
    }

    expect(fetchedObservations.body.id).toBe(promptIdTwo);
    expect(fetchedObservations.body.name).toBe("prompt-name");
    expect(fetchedObservations.body.prompt).toBe("prompt");
    expect(fetchedObservations.body.type).toBe("text");
    expect(fetchedObservations.body.version).toBe(2);
    expect(fetchedObservations.body.isActive).toBe(true);
    expect(fetchedObservations.body.createdBy).toBe("user-1");
    expect(fetchedObservations.body.config).toEqual({ temperature: 0.2 });
  });

  it("should create and fetch a prompt", async () => {
    await makeAPICall("POST", "/api/public/prompts", {
      name: "prompt-name",
      prompt: "prompt",
      isActive: true,
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      config: {
        temperature: 0.1,
      },
    });

    const fetchedObservations = await makeAPICall(
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
        isActive: true,
        version: 1,
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        createdBy: "user-1",
      },
    });

    const response = await makeAPICall("POST", "/api/public/ingestion", {
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

    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
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
        isActive: true,
        version: 1,
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        createdBy: "user-1",
      },
    });

    const response = await makeAPICall("POST", "/api/public/ingestion", {
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

    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration).toBeNull();
  });

  it("should create empty object if no config is provided", async () => {
    await makeAPICall("POST", "/api/public/prompts", {
      name: "prompt-name",
      prompt: "prompt",
      isActive: true,
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    });

    const fetchedObservations = await makeAPICall(
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
    expect(fetchedObservations.body.createdBy).toBe("API");
    expect(fetchedObservations.body.config).toEqual({});
  });

  it("should create and fetch a chat prompt", async () => {
    const promptName = "prompt-name";
    const chatMessages = [
      { role: "system", content: "You are a bot" },
      { role: "user", content: "What's up?" },
    ];
    const response = await makeAPICall("POST", "/api/public/prompts", {
      name: promptName,
      prompt: chatMessages,
      type: "chat",
      isActive: true,
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    });

    expect(response.status).toBe(201);

    const { body: fetchedPrompt } = await makeAPICall(
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
    expect(validatedPrompt.createdBy).toBe("API");
    expect(validatedPrompt.config).toEqual({});
  });

  it("should fail if chat prompt has string prompt", async () => {
    const promptName = "prompt-name";
    const response = await makeAPICall("POST", "/api/public/prompts", {
      name: promptName,
      prompt: "prompt",
      type: "chat",
      isActive: true,
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    });

    expect(response.status).toBe(400);

    const { body, status } = await makeAPICall(
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
    const response = await makeAPICall("POST", "/api/public/prompts", {
      name: promptName,
      prompt: incorrectChatMessages,
      type: "chat",
      isActive: true,
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    });

    expect(response.status).toBe(400);

    const { body, status } = await makeAPICall(
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
    const response = await makeAPICall("POST", "/api/public/prompts", {
      name: promptName,
      prompt: [{ role: "system", content: "You are a bot" }],
      type: "text",
      isActive: true,
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    });

    expect(response.status).toBe(400);

    const { body, status } = await makeAPICall(
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
    const postResponse1 = await makeAPICall("POST", "/api/public/prompts", {
      name: promptName,
      prompt: chatMessages,
      type: "chat",
      isActive: true,
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    });

    expect(postResponse1.status).toBe(201);

    // Try creating a text prompt with the same name
    const postResponse2 = await makeAPICall("POST", "/api/public/prompts", {
      name: promptName,
      prompt: "prompt",
      type: "text",
      isActive: true,
      version: 2,
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    });

    expect(postResponse2.status).toBe(400);
    expect(postResponse2.body).toEqual({
      error: "ValidationError",
      message:
        "Previous versions have different prompt type. Create a new prompt with a different name.",
    });

    // Check if the prompt is still the chat prompt
    const getResponse1 = await makeAPICall(
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
    expect(validatedPrompt.createdBy).toBe("API");
    expect(validatedPrompt.config).toEqual({});

    // Check that the text prompt has not been created
    const getResponse2 = await makeAPICall(
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

const isPrompt = (x: unknown): x is Prompt => {
  if (typeof x !== "object" || x === null) return false;
  const prompt = x as Prompt;
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

const validatePrompt = (obj: Record<string, unknown>): ValidatedPrompt => {
  Object.keys(obj).forEach((key) => {
    obj[key] =
      key === "createdAt" || key === "updatedAt"
        ? new Date(obj[key] as string)
        : obj[key];
  });

  return PromptSchema.parse(obj);
};
