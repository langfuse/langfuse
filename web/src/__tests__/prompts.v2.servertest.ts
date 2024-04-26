/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4, v4 } from "uuid";
import { type Prompt } from "@langfuse/shared";
import {
  LegacyPromptSchema,
  PromptSchema,
  PromptType,
  type ValidatedPrompt,
  type LegacyValidatedPrompt,
} from "@/src/features/prompts/server/utils/validation";
import e from "cors";
import { nanoid } from "ai";
import { nan } from "zod";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const baseURI = "/api/public/v2/prompts";

type CreatePromptInDBParams = {
  promptId?: string;
  name: string;
  prompt: string;
  labels: string[];
  version: number;
  config: Record<string, object | number | string>;
  projectId: string;
  createdBy: string;
  type?: PromptType;
};
const createPromptInDB = async (params: CreatePromptInDBParams) => {
  return await prisma.prompt.create({
    data: {
      id: params.promptId ?? uuidv4(),
      name: params.name,
      prompt: params.prompt,
      labels: params.labels,
      version: params.version,
      config: params.config,
      project: {
        connect: { id: params.projectId },
      },
      createdBy: params.createdBy,
      type: params.type,
    },
  });
};

const testPromptEquality = (
  promptParams: CreatePromptInDBParams,
  prompt: Prompt,
) => {
  if (promptParams.promptId) {
    expect(prompt.id).toBe(promptParams.promptId);
  }
  expect(prompt.name).toBe(promptParams.name);
  expect(prompt.prompt).toBe(promptParams.prompt);
  expect(prompt.type).toBe(promptParams.type ? promptParams.type : "text");
  expect(prompt.version).toBe(promptParams.version);
  expect(prompt.labels).toEqual(promptParams.labels);
  expect(prompt.createdBy).toBe(promptParams.createdBy);
  expect(prompt.config).toEqual(promptParams.config);
  expect(prompt.tags).toEqual([]);
};

describe("/api/public/v2/prompts API Endpoint", () => {
  afterAll(pruneDatabase);

  describe("when fetching a prompt", () => {
    beforeAll(pruneDatabase);

    it("should return a 401 if key is invalid", async () => {
      const projectId = uuidv4();
      const response = await makeAPICall(
        "GET",
        `/api/public/v2/prompts`,
        undefined,
        `Bearer ${projectId}`,
      );
      expect(response.status).toBe(401);

      const body = response.body;

      expect(body).toHaveProperty("error");
      expect(body.error).toContain("Unauthorized");
    });

    it("should fetch a prompt", async () => {
      const promptId = uuidv4();
      const promptName = "promptName" + nanoid();
      const createPromptParams: CreatePromptInDBParams = {
        promptId: promptId,
        name: promptName,
        prompt: "prompt",
        labels: ["production"],
        version: 1,
        config: {
          temperature: 0.1,
        },
        projectId,
        createdBy: "user-1",
      };

      await createPromptInDB(createPromptParams);

      const fetchedPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}`,
        undefined,
      );
      expect(fetchedPrompt.status).toBe(200);

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(createPromptParams, fetchedPrompt.body);
    });

    it("should fetch a prompt with special characters", async () => {
      const promptName = "promptName?!+ =@#;" + nanoid();

      const createPromptParams: CreatePromptInDBParams = {
        name: promptName,
        prompt: "prompt",
        labels: ["production"],
        version: 1,
        config: {
          temperature: 0.1,
        },
        projectId,
        createdBy: "user-1",
      };

      await createPromptInDB(createPromptParams);

      const fetchedPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}`,
        undefined,
      );
      expect(fetchedPrompt.status).toBe(200);

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(createPromptParams, fetchedPrompt.body);
    });

    it("should fetch a prompt by version even if not production", async () => {
      const promptName = "nonProductionPrompt" + nanoid();

      const createPromptParams: CreatePromptInDBParams = {
        name: promptName,
        prompt: "prompt",
        labels: [],
        version: 1,
        config: {
          temperature: 0.1,
        },
        projectId,
        createdBy: "user-1",
      };

      await createPromptInDB(createPromptParams);

      const fetchedDefaultPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}`,
        undefined,
      );
      expect(fetchedDefaultPrompt.status).toBe(404);

      const fetchedPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}?version=1`,
        undefined,
      );

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(createPromptParams, fetchedPrompt.body);
    });

    it("should fetch a prompt by label even if not production", async () => {
      const promptName = "nonProductionPrompt_" + nanoid();

      const createPromptParams: CreatePromptInDBParams = {
        name: promptName,
        prompt: "prompt",
        labels: ["dev"],
        version: 1,
        config: {
          temperature: 0.1,
        },
        projectId,
        createdBy: "user-1",
      };

      await createPromptInDB(createPromptParams);

      const fetchedDefaultPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}`,
        undefined,
      );
      expect(fetchedDefaultPrompt.status).toBe(404);

      const fetchedPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}?label=dev`,
        undefined,
      );

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(createPromptParams, fetchedPrompt.body);
    });

    it("should fetch the production prompt if no version or label set", async () => {
      const promptName = "prompt_" + nanoid();

      const nonProductionPromptParams: CreatePromptInDBParams = {
        name: promptName,
        prompt: "prompt",
        labels: ["staging"],
        version: 1,
        config: {
          temperature: 0.1,
        },
        projectId,
        createdBy: "user-1",
      };

      const productionPromptParams: CreatePromptInDBParams = {
        name: promptName,
        prompt: "prompt",
        labels: ["production"],
        version: 2,
        config: {
          temperature: 0.1,
        },
        projectId,
        createdBy: "user-1",
      };

      await createPromptInDB(productionPromptParams);
      await createPromptInDB(nonProductionPromptParams);

      const fetchedPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}`,
        undefined,
      );

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(productionPromptParams, fetchedPrompt.body);
    });

    it("should return a 404 if prompt does not exist", async () => {
      const fetchedPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent("random_prompt")}`,
        undefined,
      );

      expect(fetchedPrompt.status).toBe(404);
      expect(fetchedPrompt.body).toHaveProperty("error");
      expect(fetchedPrompt.body.error).toContain("NotFound");
    });

    it("should relate generation to prompt", async () => {
      const promptName = "prompt-name" + nanoid();
      const traceId = v4();
      const generationId = v4();

      const promptId = uuidv4();

      await prisma.prompt.create({
        data: {
          id: promptId,
          name: promptName,
          prompt: "prompt",
          labels: ["production"],
          version: 1,
          project: {
            connect: { id: projectId },
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
              promptName,
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
  });

  describe("when creating a prompt", () => {
    beforeAll(pruneDatabase);

    it("should create and fetch a chat prompt", async () => {
      const promptName = "prompt-name" + nanoid();
      const chatMessages = [
        { role: "system", content: "You are a bot" },
        { role: "user", content: "What's up?" },
      ];
      const response = await makeAPICall("POST", baseURI, {
        name: promptName,
        prompt: chatMessages,
        type: "chat",
        labels: ["production"],
      });

      expect(response.status).toBe(201);

      const { body: fetchedPrompt } = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
        undefined,
      );

      const validatedPrompt = validatePrompt(fetchedPrompt);

      expect(validatedPrompt.name).toBe(promptName);
      expect(validatedPrompt.prompt).toEqual(chatMessages);
      expect(validatedPrompt.type).toBe("chat");
      expect(validatedPrompt.version).toBe(1);
      expect(validatedPrompt.labels).toEqual(["production"]);
      expect(validatedPrompt.createdBy).toBe("API");
      expect(validatedPrompt.config).toEqual({});
    });

    it("should fail if chat prompt has string prompt", async () => {
      const promptName = "prompt-name";
      const response = await makeAPICall("POST", baseURI, {
        name: promptName,
        prompt: "prompt",
        type: "chat",
        labels: ["production"],
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
      const promptName = "prompt-name" + nanoid();
      const incorrectChatMessages = [
        { role: "system", content: "You are a bot" },
        { role: "user", message: "What's up?" },
      ];
      const response = await makeAPICall("POST", baseURI, {
        name: promptName,
        prompt: incorrectChatMessages,
        type: "chat",
        labels: ["production"],
      });

      expect(response.status).toBe(400);

      const { body, status } = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
        undefined,
      );
      expect(status).toBe(404);
      expect(body.error).toBe("LangfuseNotFoundError");
    });

    it("should fail if text prompt has message format", async () => {
      const promptName = "prompt-name" + nanoid();
      const response = await makeAPICall("POST", baseURI, {
        name: promptName,
        prompt: [{ role: "system", content: "You are a bot" }],
        type: "text",
        labels: ["production"],
      });

      expect(response.status).toBe(400);

      const { body, status } = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
        undefined,
      );
      expect(status).toBe(404);
      expect(body.error).toBe("LangfuseNotFoundError");
    });

    it("should fail if previous versions have different prompt type", async () => {
      // Create a chat prompt
      const promptName = "prompt-name" + nanoid();
      const chatMessages = [
        { role: "system", content: "You are a bot" },
        { role: "user", content: "What's up?" },
      ];
      const postResponse1 = await makeAPICall("POST", baseURI, {
        name: promptName,
        prompt: chatMessages,
        labels: ["production"],
        type: "chat",
      });

      expect(postResponse1.status).toBe(201);

      // Try creating a text prompt with the same name
      const postResponse2 = await makeAPICall("POST", baseURI, {
        name: promptName,
        prompt: "prompt",
        type: "text",
        labels: ["production"],
        version: 2,
      });

      expect(postResponse2.status).toBe(400);
      expect(postResponse2.body.error).toBe("ValidationError");

      // Check if the prompt is still the chat prompt
      const getResponse1 = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
        undefined,
      );
      expect(getResponse1.status).toBe(200);

      const validatedPrompt = validatePrompt(getResponse1.body);

      expect(validatedPrompt.name).toBe(promptName);
      expect(validatedPrompt.prompt).toEqual(chatMessages);
      expect(validatedPrompt.type).toBe("chat");
      expect(validatedPrompt.version).toBe(1);
      expect(validatedPrompt.labels).toEqual(["production"]);
      expect(validatedPrompt.createdBy).toBe("API");
      expect(validatedPrompt.config).toEqual({});

      // Check that the text prompt has not been created
      const getResponse2 = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}?version=2`,
        undefined,
      );
      expect(getResponse2.status).toBe(404);
      expect(getResponse2.body.error).toBe("LangfuseNotFoundError");
    });

    it("should correctly handle overwriting labels", async () => {
      const promptName = "prompt-name" + nanoid();
      // First prompt has multiple labels
      const prompt1 = await makeAPICall("POST", baseURI, {
        name: promptName,
        prompt: "prompt1",
        labels: ["production", "staging", "development"],
        version: 1,
        config: {
          temperature: 0.1,
        },
        createdBy: "user-1",
      });

      // Second prompt overwrites production and staging label
      const prompt2 = await makeAPICall("POST", baseURI, {
        name: promptName,
        prompt: "prompt2",
        labels: ["production", "production", "staging"], // Should be deduped
        version: 2,
        config: {
          temperature: 0.2,
        },
        createdBy: "user-1",
      });

      // Third prompt overwrites staging label
      const prompt3 = await makeAPICall("POST", baseURI, {
        name: promptName,
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
      const fetchedProductionPrompt = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
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
      const fetchedFirstPrompt = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}?version=1`,
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
      const fetchedThirdPrompt = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}?version=3`,
        undefined,
      );

      expect(fetchedThirdPrompt.status).toBe(200);
      if (!isPrompt(fetchedThirdPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      // @ts-expect-error
      expect(fetchedThirdPrompt.body.id).toBe(prompt3.body.id);
      expect(fetchedThirdPrompt.body.labels).toEqual(["staging"]);
    });

    it("should create empty object if no config is provided", async () => {
      const promptName = "prompt-name" + nanoid();

      await makeAPICall("POST", baseURI, {
        name: promptName,
        prompt: "prompt",
        labels: ["production"],
      });

      const fetchedPrompt = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
        undefined,
      );

      expect(fetchedPrompt.status).toBe(200);

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      console.log(fetchedPrompt.body);

      expect(fetchedPrompt.body.name).toBe(promptName);
      expect(fetchedPrompt.body.prompt).toBe("prompt");
      expect(fetchedPrompt.body.type).toBe("text");
      expect(fetchedPrompt.body.version).toBe(1);
      expect(fetchedPrompt.body.labels).toEqual(["production"]);
      expect(fetchedPrompt.body.createdBy).toBe("API");
      expect(fetchedPrompt.body.config).toEqual({});
    });
  });

  describe("when fetching a prompt list", () => {
    beforeAll(pruneDatabase);

    it.skip("should only return prompts from the current project", async () => {});

    it.skip("should fetch a prompt meta list", async () => {});

    it.skip("should fetch a prompt meta list with name filter", async () => {});

    it.skip("should fetch a prompt meta list with tag filter", async () => {});

    it.skip("should fetch a prompt meta list with label filter", async () => {});
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
    Array.isArray(prompt.labels) &&
    Array.isArray(prompt.tags) &&
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
