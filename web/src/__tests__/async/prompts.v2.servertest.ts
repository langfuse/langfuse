/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { disconnectQueues, makeAPICall } from "@/src/__tests__/test-utils";
import { v4 as uuidv4, v4 } from "uuid";
import {
  PromptSchema,
  type ValidatedPrompt,
  type ChatMessage,
  type Prompt,
  PromptType,
} from "@langfuse/shared";
import { parsePromptDependencyTags } from "@langfuse/shared";
import { generateId, nanoid } from "ai";

import { type PromptsMetaResponse } from "@/src/features/prompts/server/actions/getPromptsMeta";
import {
  createOrgProjectAndApiKey,
  getObservationById,
  MAX_PROMPT_NESTING_DEPTH,
  ChatMessageType,
} from "@langfuse/shared/src/server";
import { randomUUID } from "node:crypto";
import waitForExpect from "wait-for-expect";
import { createPrompt } from "@/src/features/prompts/server/actions/createPrompt";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const baseURI = "/api/public/v2/prompts";

type CreatePromptInDBParams = {
  promptId?: string;
  name: string;
  prompt: string;
  labels: string[];
  version: number;
  config: any;
  projectId: string;
  createdBy: string;
  type?: PromptType;
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
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
      tags: params.tags,
      createdAt: params.createdAt,
      updatedAt: params.updatedAt,
    },
  });
};

const setupTriggerAndAction = async (projectId: string) => {
  const trigger = await prisma.trigger.create({
    data: {
      id: v4(),
      projectId: projectId,
      eventSource: "prompt",
      eventActions: ["updated"],
      filter: [],
      status: "ACTIVE",
    },
  });
  trigger.id;

  // Create webhook action
  const action = await prisma.action.create({
    data: {
      id: v4(),
      projectId: projectId,
      type: "WEBHOOK",
      config: {
        type: "WEBHOOK",
        url: "https://example.com/prompt-labels-webhook",
        headers: { "Content-Type": "application/json" },
        apiVersion: { prompt: "v1" },
      },
    },
  });
  action.id;

  // Link trigger to action
  await prisma.automation.create({
    data: {
      projectId: projectId,
      triggerId: trigger.id,
      actionId: action.id,
      name: "Prompt Labels Automation",
    },
  });
  return {
    actionId: action.id,
    triggerId: trigger.id,
  };
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
  expect(prompt.resolutionGraph).toBeNull();
};

describe("/api/public/v2/prompts API Endpoint", () => {
  afterAll(async () => {
    await disconnectQueues();
  });
  describe("when fetching a prompt", () => {
    it("should return a 401 if key is invalid", async () => {
      const projectId = uuidv4();
      const response = await makeAPICall(
        "GET",
        baseURI,
        undefined,
        `Bearer ${projectId}`,
      );
      expect(response.status).toBe(401);

      const body = response.body;

      expect(body).toHaveProperty("error");
      // @ts-expect-error
      expect(body.error).toContain("Unauthorized");
    });

    it("should fetch a prompt", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

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
        auth,
      );
      expect(fetchedPrompt.status).toBe(200);

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(createPromptParams, fetchedPrompt.body);
    });

    it("should fetch a prompt with special characters", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
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
        auth,
      );
      expect(fetchedPrompt.status).toBe(200);

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(createPromptParams, fetchedPrompt.body);
    });

    it("should fetch a prompt by version even if not production", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
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
        auth,
      );
      expect(fetchedDefaultPrompt.status).toBe(404);

      const fetchedPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}?version=1`,
        undefined,
        auth,
      );

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(createPromptParams, fetchedPrompt.body);
    });

    it("should fetch a prompt by label even if not production", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
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
        auth,
      );
      expect(fetchedDefaultPrompt.status).toBe(404);

      const fetchedPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}?label=dev`,
        undefined,
        auth,
      );

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(createPromptParams, fetchedPrompt.body);
    });

    (it("should fetch the latest prompt if label is latest", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
      const promptName = "latestPrompt_" + nanoid();

      const productionPromptParams: CreatePromptInDBParams = {
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

      const latestPromptParams: CreatePromptInDBParams = {
        name: promptName,
        prompt: "prompt",
        labels: ["latest"],
        version: 2,
        config: {
          temperature: 0.1,
        },
        projectId,
        createdBy: "user-1",
      };

      await createPromptInDB(latestPromptParams);
      await createPromptInDB(productionPromptParams);

      const fetchedPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}?label=latest`,
        undefined,
        auth,
      );

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(latestPromptParams, fetchedPrompt.body);

      const fetchedDefaultPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}`,
        undefined,
        auth,
      );

      expect(fetchedDefaultPrompt.status).toBe(200);

      if (!isPrompt(fetchedDefaultPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(productionPromptParams, fetchedDefaultPrompt.body);
    }),
      it("should fetch the production prompt if no version or label set", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
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
          auth,
        );

        if (!isPrompt(fetchedPrompt.body)) {
          throw new Error("Expected body to be a prompt");
        }

        testPromptEquality(productionPromptParams, fetchedPrompt.body);
      }));

    it("should return a 404 if prompt does not exist", async () => {
      const fetchedPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent("random_prompt")}`,
        undefined,
      );

      expect(fetchedPrompt.status).toBe(404);
      expect(fetchedPrompt.body).toHaveProperty("error");
      // @ts-expect-error
      expect(fetchedPrompt.body.error).toContain("NotFound");
    });

    it("should relate generation to prompt", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
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

      const response = await makeAPICall(
        "POST",
        "/api/public/ingestion",
        {
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
        },
        auth,
      );

      expect(response.status).toBe(207);

      // Delay to allow for async processing
      await waitForExpect(async () => {
        const dbGeneration = await getObservationById({
          id: generationId,
          projectId,
        });

        expect(dbGeneration?.id).toBe(generationId);
        expect(dbGeneration?.promptId).toBe(promptId);
      }, 8000);
    }, 10000);
  });

  describe("when creating a prompt", () => {
    it("should create and fetch a chat prompt", async () => {
      const { auth, projectId } = await createOrgProjectAndApiKey();
      const { actionId, triggerId } = await setupTriggerAndAction(projectId);
      const promptName = "prompt-name" + nanoid();
      const chatMessages = [
        { role: "system", content: "You are a bot" },
        { role: "user", content: "What's up?" },
      ];
      const response = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: chatMessages,
          type: "chat",
          labels: ["production"],
          commitMessage: "chore: setup initial prompt",
        },
        auth,
      );

      expect(response.status).toBe(201);

      const { body: fetchedPrompt } = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
        undefined,
        auth,
      );

      const validatedPrompt = validatePrompt(fetchedPrompt);

      expect(validatedPrompt.name).toBe(promptName);
      expect(validatedPrompt.prompt).toEqual(chatMessages);
      expect(validatedPrompt.type).toBe("chat");
      expect(validatedPrompt.version).toBe(1);
      expect(validatedPrompt.labels).toEqual(["production", "latest"]);
      expect(validatedPrompt.createdBy).toBe("API");
      expect(validatedPrompt.config).toEqual({});
      expect(validatedPrompt.commitMessage).toBe("chore: setup initial prompt");

      await waitForExpect(async () => {
        // check that the action execution is created
        const actionExecution = await prisma.automationExecution.findFirst({
          where: {
            projectId,
            triggerId,
            actionId,
          },
        });
        expect(actionExecution).not.toBeNull();
        expect(actionExecution?.status).toBe("PENDING");
        expect(actionExecution?.sourceId).toBe(validatedPrompt.id);
      });
    }, 10000);

    it("should create and fetch a chat prompt with message placeholders", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const promptName = `prompt-name-message-placeholders${generateId()}`;
      const commitMessage = "feat: add message placeholders support";
      const chatMessages = [
        {
          role: "system",
          content: "You are a helpful assistant with conversation context.",
        },
        {
          type: ChatMessageType.Placeholder,
          name: "conversation_history",
        },
        { role: "user", content: "{{user_question}}" },
      ];

      const response = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: chatMessages,
          type: "chat",
          labels: ["production"],
          commitMessage: commitMessage,
        },
        auth,
      );

      expect(response.status).toBe(201);

      const { body: fetchedPrompt } = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
        undefined,
        auth,
      );

      const validatedPrompt = validatePrompt(fetchedPrompt);

      expect(validatedPrompt.name).toBe(promptName);
      expect(validatedPrompt.prompt).toEqual(chatMessages);
      expect(validatedPrompt.type).toBe("chat");
      expect(validatedPrompt.version).toBe(1);
      expect(validatedPrompt.labels).toEqual(["production", "latest"]);
      expect(validatedPrompt.createdBy).toBe("API");
      expect(validatedPrompt.config).toEqual({});
      expect(validatedPrompt.commitMessage).toBe(commitMessage);

      // Verify the placeholder message structure is preserved
      const messages = validatedPrompt.prompt as ChatMessage[];
      const placeholderMessage = messages[1] as {
        type: ChatMessageType.Placeholder;
        name: string;
      };
      expect(placeholderMessage.type).toBe(ChatMessageType.Placeholder);
      expect(placeholderMessage.name).toBe("conversation_history");
    });

    it("should fail if chat prompt has string prompt", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const promptName = "prompt-name";
      const response = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: "prompt",
          type: "chat",
          labels: ["production"],
        },
        auth,
      );

      expect(response.status).toBe(400);

      const { body, status } = await makeAPICall(
        "GET",
        `/api/public/prompts?name=${promptName}`,
        undefined,
        auth,
      );
      expect(status).toBe(404);
      expect(body).toEqual({
        error: "LangfuseNotFoundError",
        message: "Prompt not found",
      });
    });

    it("should fail if chat prompt has incorrect messages format", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const promptName = "prompt-name" + nanoid();
      const incorrectChatMessages = [
        { role: "system", content: "You are a bot" },
        { role: "user", message: "What's up?" },
      ];
      const response = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: incorrectChatMessages,
          type: "chat",
          labels: ["production"],
        },
        auth,
      );

      expect(response.status).toBe(400);

      const { body, status } = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
        undefined,
        auth,
      );
      expect(status).toBe(404);
      // @ts-expect-error
      expect(body.error).toBe("LangfuseNotFoundError");
    });

    it("should fail if text prompt has message format", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const promptName = "prompt-name" + nanoid();
      const response = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: [{ role: "system", content: "You are a bot" }],
          type: "text",
          labels: ["production"],
        },
        auth,
      );

      expect(response.status).toBe(400);

      const { body, status } = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
        undefined,
        auth,
      );
      expect(status).toBe(404);
      // @ts-expect-error
      expect(body.error).toBe("LangfuseNotFoundError");
    });

    it("should fail if previous versions have different prompt type", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      // Create a chat prompt
      const promptName = "prompt-name" + nanoid();
      const chatMessages = [
        { role: "system", content: "You are a bot" },
        { role: "user", content: "What's up?" },
      ];
      const postResponse1 = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: chatMessages,
          labels: ["production"],
          type: "chat",
        },
        auth,
      );

      expect(postResponse1.status).toBe(201);

      // Try creating a text prompt with the same name
      const postResponse2 = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: "prompt",
          type: "text",
          labels: ["production"],
          version: 2,
        },
        auth,
      );

      expect(postResponse2.status).toBe(400);
      // @ts-expect-error
      expect(postResponse2.body.error).toBe("InvalidRequestError");

      // Check if the prompt is still the chat prompt
      const getResponse1 = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
        undefined,
        auth,
      );
      expect(getResponse1.status).toBe(200);

      const validatedPrompt = validatePrompt(getResponse1.body);

      expect(validatedPrompt.name).toBe(promptName);
      expect(validatedPrompt.prompt).toEqual(chatMessages);
      expect(validatedPrompt.type).toBe("chat");
      expect(validatedPrompt.version).toBe(1);
      expect(validatedPrompt.labels).toEqual(["production", "latest"]);
      expect(validatedPrompt.createdBy).toBe("API");
      expect(validatedPrompt.config).toEqual({});

      // Check that the text prompt has not been created
      const getResponse2 = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}?version=2`,
        undefined,
        auth,
      );
      expect(getResponse2.status).toBe(404);
      // @ts-expect-error
      expect(getResponse2.body.error).toBe("LangfuseNotFoundError");
    });

    it("should correctly handle overwriting labels", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const promptName = "prompt-name" + nanoid();
      // First prompt has multiple labels
      const prompt1 = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: "prompt1",
          labels: ["production", "staging", "development"],
          version: 1,
          config: {
            temperature: 0.1,
          },
          createdBy: "user-1",
        },
        auth,
      );

      // Second prompt overwrites production and staging label
      const prompt2 = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: "prompt2",
          labels: ["production", "production", "staging"], // Should be deduped
          version: 2,
          config: {
            temperature: 0.2,
          },
          createdBy: "user-1",
        },
        auth,
      );

      // Third prompt overwrites staging label
      const prompt3 = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: "prompt3",
          labels: ["staging"],
          isActive: false,
          version: 3,
          config: {
            temperature: 0.3,
          },
          createdBy: "user-1",
        },
        auth,
      );

      // Expect the second prompt to be fetched as default production prompt
      const fetchedProductionPrompt = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
        undefined,
        auth,
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
        auth,
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
        auth,
      );

      expect(fetchedThirdPrompt.status).toBe(200);
      if (!isPrompt(fetchedThirdPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      // @ts-expect-error
      expect(fetchedThirdPrompt.body.id).toBe(prompt3.body.id);
      expect(fetchedThirdPrompt.body.labels).toEqual(["staging", "latest"]);
    });

    it("should create empty object if no config is provided", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const promptName = "prompt-name" + nanoid();

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: "prompt",
          labels: ["production"],
        },
        auth,
      );

      const fetchedPrompt = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}`,
        undefined,
        auth,
      );

      expect(fetchedPrompt.status).toBe(200);

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      expect(fetchedPrompt.body.name).toBe(promptName);
      expect(fetchedPrompt.body.prompt).toBe("prompt");
      expect(fetchedPrompt.body.type).toBe("text");
      expect(fetchedPrompt.body.version).toBe(1);
      expect(fetchedPrompt.body.labels).toEqual(["production", "latest"]);
      expect(fetchedPrompt.body.createdBy).toBe("API");
      expect(fetchedPrompt.body.config).toEqual({});
    });

    describe("prompt name validation", () => {
      const testInvalidName = async (
        name: string,
        expectedError: string,
        auth?: string,
      ) => {
        const response = await makeAPICall(
          "POST",
          baseURI,
          {
            name,
            prompt: "test prompt",
            type: "text",
          },
          auth,
        );
        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Invalid request data");
        expect(JSON.stringify(response.body.error)).toContain(
          `"message":"${expectedError}"`,
        );
        const hasExpectedMessage = JSON.stringify(response.body.error).includes(
          `"message":"${expectedError}"`,
        );
        expect(hasExpectedMessage).toBe(true);
      };

      const testValidName = async (name: string, auth?: string) => {
        const response = await makeAPICall(
          "POST",
          baseURI,
          {
            name,
            prompt: "test prompt",
            type: "text",
          },
          auth,
        );
        expect(response.status).toBe(201);
        await prisma.prompt.deleteMany({
          where: { name, projectId },
        });
      };

      it("should reject invalid prompt names", async () => {
        const { auth } = await createOrgProjectAndApiKey();
        // Test invalid patterns
        await testInvalidName(
          "/invalid-name",
          "Name cannot start with a slash",
          auth,
        );
        await testInvalidName(
          "invalid-name/",
          "Name cannot end with a slash",
          auth,
        );
        await testInvalidName(
          "invalid//name",
          "Name cannot contain consecutive slashes",
          auth,
        );
        await testInvalidName(
          "invalid|name",
          "Prompt name cannot contain '|' character",
          auth,
        );
        await testInvalidName("new", "Prompt name cannot be 'new'", auth);
        await testInvalidName("", "Text cannot be empty", auth);
        await testInvalidName(
          "Test <div>",
          "Text cannot contain HTML tags",
          auth,
        );
      });

      it("should accept valid prompt names", async () => {
        const { auth } = await createOrgProjectAndApiKey();
        const validNames = [
          "simple-name",
          "name_with_underscores",
          "name.with.dots",
          "UPPERCASE",
          "folder/subfolder/name",
          "name-with-123-numbers",
          "_starting_with_underscore",
          "ending_with_underscore_",
          "multiple___underscores",
          "multiple---hyphens",
          "multiple...dots",
          "name with spaces",
          "multiple   spaces",
          "angled[brac]es]",
        ];

        for (const name of validNames) {
          await testValidName(name, auth);
        }
      });
    });

    it("should update tags across versions", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const promptName = "prompt-name" + nanoid();

      const createPromptVersion = async (tags?: string[]) => {
        await makeAPICall(
          "POST",
          baseURI,
          {
            name: promptName,
            prompt: "This is a test prompt",
            type: PromptType.Text,
            ...(tags !== undefined && { tags: tags }),
          },
          auth,
        );
      };

      const fetchPromptVersion = async (version: number) => {
        const fetchedPrompt = await makeAPICall(
          "GET",
          `${baseURI}/${promptName}?version=${version}`,
          undefined,
          auth,
        );
        expect(fetchedPrompt.status).toBe(200);
        if (!isPrompt(fetchedPrompt.body)) {
          throw new Error("Expected body to be a prompt");
        }
        return fetchedPrompt.body;
      };

      // Create version 1 with ["tag"]
      await createPromptVersion(["tag"]);
      let fetchedPrompt1 = await fetchPromptVersion(1);
      expect(fetchedPrompt1.tags).toEqual(["tag"]);
      expect(fetchedPrompt1.version).toBe(1);

      // Create version 2 with no tags provided (should use tags from version 1)
      await createPromptVersion();
      let fetchedPrompt2 = await fetchPromptVersion(2);
      expect(fetchedPrompt2.tags).toEqual(["tag"]);
      expect(fetchedPrompt2.version).toBe(2);

      // Create version 3 with ["tag1", "tag2", "tag3"] (should update tags across versions)
      await createPromptVersion(["tag1", "tag2", "tag3"]);
      fetchedPrompt1 = await fetchPromptVersion(1);
      fetchedPrompt2 = await fetchPromptVersion(2);
      let fetchedPrompt3 = await fetchPromptVersion(3);
      expect(fetchedPrompt1.tags).toEqual(["tag1", "tag2", "tag3"]);
      expect(fetchedPrompt1.version).toBe(1);
      expect(fetchedPrompt2.tags).toEqual(["tag1", "tag2", "tag3"]);
      expect(fetchedPrompt2.version).toBe(2);
      expect(fetchedPrompt3.tags).toEqual(["tag1", "tag2", "tag3"]);
      expect(fetchedPrompt3.version).toBe(3);

      // remove tags
      await createPromptVersion([]);
      fetchedPrompt1 = await fetchPromptVersion(1);
      fetchedPrompt2 = await fetchPromptVersion(2);
      fetchedPrompt3 = await fetchPromptVersion(3);
      let fetchedPrompt4 = await fetchPromptVersion(4);
      expect(fetchedPrompt1.tags).toEqual([]);
      expect(fetchedPrompt1.version).toBe(1);
      expect(fetchedPrompt2.tags).toEqual([]);
      expect(fetchedPrompt2.version).toBe(2);
      expect(fetchedPrompt3.tags).toEqual([]);
      expect(fetchedPrompt3.version).toBe(3);
      expect(fetchedPrompt4.tags).toEqual([]);
      expect(fetchedPrompt4.version).toBe(4);
    });

    it("should create and fetch a test prompt with slashes in the name", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const promptName = "this/is/a/prompt/with/a/slash" + nanoid();

      const response = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: "This is a prompt in a folder structure",
          type: "text",
          labels: ["production"],
          commitMessage: "chore: setup folder structure prompt",
        },
        auth,
      );

      expect(response.status).toBe(201);

      const { body: fetchedPrompt } = await makeAPICall(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}`,
        undefined,
        auth,
      );

      const validatedPrompt = validatePrompt(fetchedPrompt);
      // expect(fetchedPrompt.status).toBe(200);
      // if (!isPrompt(fetchedPrompt.body)) {
      //   throw new Error("Expected body to be a prompt");
      // }

      // Verify the name with slashes is preserved
      expect(validatedPrompt.name).toBe(promptName);
      expect(validatedPrompt.name).toContain("/");
      expect(validatedPrompt.prompt).toBe(
        "This is a prompt in a folder structure",
      );
    });

    it("should prevent creating a prompt with both a variable and placeholder with the same name", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const promptName = "prompt-same-name-conflict-" + nanoid();

      // Try to create a prompt where the same name is used as both a variable and a placeholder
      const response = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: [
            { role: "system", content: "Hello {{userName}}" },
            { type: ChatMessageType.Placeholder, name: "userName" },
            { role: "user", content: "How are you?" },
          ],
          type: "chat",
        },
        auth,
      );

      // This should fail with a 400 error
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body).toHaveProperty("message");
      // @ts-expect-error
      expect(response.body.message).toContain(
        "variables and placeholders must be unique",
      );
      // @ts-expect-error
      expect(response.body.message).toContain("userName");
    });

    it("should allow creating a new version of a prompt with placeholder names that conflict a variable name in a previous version", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const promptName = "prompt-with-variable-conflict-" + nanoid();

      // First, create a chat prompt with a message variable
      const v1Response = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: [
            {
              role: "system",
              content: "You are a helpful {{conversationHistory}}",
            },
            { role: "user", content: "Continue our conversation" },
          ],
          type: "chat",
          labels: ["production"],
        },
        auth,
      );

      expect(v1Response.status).toBe(201);

      // Try to create a new version with a text variable that has the same name as the placeholder
      const v2Response = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: [
            {
              role: "system",
              content:
                "You are a helpful assistant with context: {{newHistory}}",
            },
            { type: "placeholder", name: "conversationHistory" },
            { role: "user", content: "Continue our conversation" },
          ],
          type: "chat",
        },
        auth,
      );

      // This should succeed, we allow cross-version name reuse
      expect(v2Response.status).toBe(201);
      expect(v2Response.body).toHaveProperty("id");
      expect(v2Response.body).toHaveProperty("version");
      // @ts-expect-error - Response body type is flexible for testing
      expect(v2Response.body.version).toBe(2);
    });
  });

  describe("when fetching a prompt list", () => {
    const otherProjectPromptName = "prompt-5";
    let otherProjectId: string;
    let projectId: string;
    let auth: string;

    beforeEach(async () => {
      // Create a prompt in a different project
      ({ projectId: projectId, auth: auth } =
        await createOrgProjectAndApiKey());

      ({ projectId: otherProjectId } = await createOrgProjectAndApiKey());

      await createPromptInDB({
        name: otherProjectPromptName,
        prompt: "prompt-5",
        labels: ["production"],
        version: 1,
        config: {},
        projectId: otherProjectId,
        createdBy: "user-test",
      });

      // Create prompts in the current project
      await Promise.all(
        getMockPrompts(projectId, otherProjectId).map(createPromptInDB),
      );
    });

    it("should only return prompts from the current project", async () => {
      // Add a prompt from a different project

      const response = await makeAPICall("GET", `${baseURI}`, undefined, auth);
      expect(response.status).toBe(200);
      const body = response.body as unknown as PromptsMetaResponse;

      expect(body.data).toHaveLength(3);
      expect(
        body.data.some((promptMeta) => promptMeta.name === "prompt-1"),
      ).toBe(true);
      expect(
        body.data.some(
          (promptMeta) => promptMeta.name === otherProjectPromptName,
        ),
      ).toBe(false);
    });

    it("should fetch a prompt meta list", async () => {
      const response = await makeAPICall("GET", `${baseURI}`, undefined, auth);
      expect(response.status).toBe(200);
      const body = response.body as unknown as PromptsMetaResponse;

      expect(body.data).toHaveLength(3);
      expect(
        body.data.some(
          (promptMeta) => promptMeta.name === otherProjectPromptName,
        ),
      ).toBe(false);

      const [promptMeta1, promptMeta2, promptMeta3] = body.data;

      // Validate prompt-1 meta
      expect(promptMeta1.name).toBe("prompt-1");
      expect(promptMeta1.versions).toEqual([1, 2, 4]);
      expect(promptMeta1.labels).toEqual(["production", "version2"]);
      expect(promptMeta1.tags).toEqual([]);
      expect(promptMeta1.type).toBe(PromptType.Text);
      expect(promptMeta1.lastUpdatedAt).toBeDefined();

      // Validate prompt-2 meta
      expect(promptMeta2.name).toBe("prompt-2");
      expect(promptMeta2.versions).toEqual([1, 2, 3]);
      expect(promptMeta2.labels).toEqual(["dev", "production", "staging"]);
      expect(promptMeta2.tags).toEqual([]);
      expect(promptMeta2.type).toBe(PromptType.Text);
      expect(promptMeta2.lastUpdatedAt).toBeDefined();

      // Validate prompt-3 meta
      expect(promptMeta3.name).toBe("prompt-3");
      expect(promptMeta3.versions).toEqual([1]);
      expect(promptMeta3.labels).toEqual(["production"]);
      expect(promptMeta3.tags).toEqual(["tag-1"]);
      expect(promptMeta3.type).toBe(PromptType.Chat);
      expect(promptMeta3.lastUpdatedAt).toBeDefined();

      // Validate pagination
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(1);
      expect(body.meta.totalItems).toBe(3);

      // Validate pagination backwards compatibility
      // https://github.com/langfuse/langfuse/issues/2068
      expect(body.pagination?.page).toBe(1);
      expect(body.pagination?.limit).toBe(10);
      expect(body.pagination?.totalPages).toBe(1);
      expect(body.pagination?.totalItems).toBe(3);
    });

    it("should fetch a prompt meta list with name filter", async () => {
      const response = await makeAPICall(
        "GET",
        `${baseURI}?name=prompt-1`,
        undefined,
        auth,
      );
      expect(response.status).toBe(200);
      const body = response.body as unknown as PromptsMetaResponse;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("prompt-1");
      expect(body.data[0].versions).toEqual([1, 2, 4]);
      expect(body.data[0].labels).toEqual(["production", "version2"]);
      expect(body.data[0].tags).toEqual([]);
      expect(body.data[0].type).toBe(PromptType.Text);

      // Validate pagination
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(1);
      expect(body.meta.totalItems).toBe(1);

      // Test with a different name
      const response2 = await makeAPICall(
        "GET",
        `${baseURI}?name=prompt-2`,
        undefined,
        auth,
      );
      expect(response2.status).toBe(200);
      const body2 = response2.body as unknown as PromptsMetaResponse;

      expect(body2.data).toHaveLength(1);
      expect(body2.data[0].name).toBe("prompt-2");
      expect(body2.data[0].versions).toEqual([1, 2, 3]);
      expect(body2.data[0].labels).toEqual(["dev", "production", "staging"]);
      expect(body2.data[0].tags).toEqual([]);
      expect(body2.data[0].type).toBe(PromptType.Text);

      // Validate pagination
      expect(body2.meta.page).toBe(1);
      expect(body2.meta.limit).toBe(10);
      expect(body2.meta.totalPages).toBe(1);
      expect(body2.meta.totalItems).toBe(1);

      // Return 200 with empty list if name does not exist
      const response3 = await makeAPICall(
        "GET",
        `${baseURI}?name=non-existent`,
        undefined,
        auth,
      );
      expect(response3.status).toBe(200);
      // @ts-expect-error
      expect(response3.body.data).toEqual([]);
    });

    it("should fetch a prompt meta list with tag filter", async () => {
      const response = await makeAPICall(
        "GET",
        `${baseURI}?tag=tag-1`,
        undefined,
        auth,
      );
      expect(response.status).toBe(200);
      const body = response.body as unknown as PromptsMetaResponse;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("prompt-3");
      expect(body.data[0].versions).toEqual([1]);
      expect(body.data[0].labels).toEqual(["production"]);
      expect(body.data[0].tags).toEqual(["tag-1"]);
      expect(body.data[0].type).toBe(PromptType.Chat);

      // Validate pagination
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(1);
      expect(body.meta.totalItems).toBe(1);

      // Return 200 with empty list if tag does not exist
      const response3 = await makeAPICall(
        "GET",
        `${baseURI}?tag=non-existent`,
        undefined,
        auth,
      );
      expect(response3.status).toBe(200);
      // @ts-expect-error
      expect(response3.body.data).toEqual([]);
    });

    it("should fetch a prompt meta list with label filter", async () => {
      const response = await makeAPICall(
        "GET",
        `${baseURI}?label=production`,
        undefined,
        auth,
      );
      expect(response.status).toBe(200);
      const body = response.body as unknown as PromptsMetaResponse;

      expect(body.data).toHaveLength(3);
      expect(
        body.data.some((promptMeta) => promptMeta.name === "prompt-1"),
      ).toBe(true);
      expect(
        body.data.some((promptMeta) => promptMeta.name === "prompt-2"),
      ).toBe(true);
      expect(
        body.data.some((promptMeta) => promptMeta.name === "prompt-3"),
      ).toBe(true);
      const expectedTypesByName: Record<string, PromptType> = {
        "prompt-1": PromptType.Text,
        "prompt-2": PromptType.Text,
        "prompt-3": PromptType.Chat,
      };
      body.data.forEach((promptMeta) =>
        expect(promptMeta.type).toBe(expectedTypesByName[promptMeta.name]),
      );

      // Validate pagination
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(1);
      expect(body.meta.totalItems).toBe(3);

      // Test with a different label
      const response2 = await makeAPICall(
        "GET",
        `${baseURI}?label=dev`,
        undefined,
        auth,
      );
      expect(response2.status).toBe(200);
      const body2 = response2.body as unknown as PromptsMetaResponse;

      expect(body2.data).toHaveLength(1);
      expect(body2.data[0].name).toBe("prompt-2");
      expect(body2.data[0].versions).toEqual([3]); // Only version 3 should be present as it is the only one with dev label
      expect(body2.data[0].labels).toEqual(["dev"]); // Only dev label should be present
      expect(body2.data[0].tags).toEqual([]);
      expect(body2.data[0].type).toBe(PromptType.Text);

      // Validate pagination
      expect(body2.meta.page).toBe(1);
      expect(body2.meta.limit).toBe(10);
      expect(body2.meta.totalPages).toBe(1);
      expect(body2.meta.totalItems).toBe(1);

      // Return 200 with empty list if label does not exist
      const response3 = await makeAPICall(
        "GET",
        `${baseURI}?label=non-existent`,
        undefined,
        auth,
      );
      expect(response3.status).toBe(200);
      // @ts-expect-error
      expect(response3.body.data).toEqual([]);
    });
  });

  it("should fetch a prompt meta list with pagination", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const { projectId: otherProjectId } = await createOrgProjectAndApiKey();

    await Promise.all(
      getMockPrompts(projectId, otherProjectId).map(createPromptInDB),
    );

    const response = await makeAPICall(
      "GET",
      `${baseURI}?page=1&limit=1`,
      undefined,
      auth,
    );
    expect(response.status).toBe(200);
    const body = response.body as unknown as PromptsMetaResponse;

    expect(body.data).toHaveLength(1);
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(1);
    expect(body.meta.totalPages).toBe(3);
    expect(body.meta.totalItems).toBe(3);
  });

  it("should fetch lastConfig correctly for a prompt with multiple versions", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const { projectId: otherProjectId } = await createOrgProjectAndApiKey();

    await Promise.all(
      getMockPrompts(projectId, otherProjectId).map(createPromptInDB),
    );
    // no filters
    const response = await makeAPICall("GET", `${baseURI}`, undefined, auth);
    expect(response.status).toBe(200);
    const body = response.body as unknown as PromptsMetaResponse;

    expect(body.data).toHaveLength(3);
    expect(body.data.some((promptMeta) => promptMeta.name === "prompt-1")).toBe(
      true,
    );
    expect(body.data.some((promptMeta) => promptMeta.name === "prompt-2")).toBe(
      true,
    );
    expect(body.data.some((promptMeta) => promptMeta.name === "prompt-3")).toBe(
      true,
    );
    const prompt1 = body.data.find(
      (promptMeta) => promptMeta.name === "prompt-1",
    );
    expect(prompt1).toBeDefined();
    expect(prompt1?.lastConfig).toEqual({ version: 4 });
    expect(prompt1?.type).toBe(PromptType.Text);

    const prompt2 = body.data.find(
      (promptMeta) => promptMeta.name === "prompt-2",
    );
    expect(prompt2).toBeDefined();
    expect(prompt2?.lastConfig).toEqual({});
    expect(prompt2?.type).toBe(PromptType.Text);

    // validate with label filter
    const response2 = await makeAPICall(
      "GET",
      `${baseURI}?label=version2`,
      undefined,
      auth,
    );
    expect(response2.status).toBe(200);
    const body2 = response2.body as unknown as PromptsMetaResponse;

    expect(body2.data).toHaveLength(1);
    expect(body2.data[0].name).toBe("prompt-1");
    expect(body2.data[0].lastConfig).toEqual({ version: 2 });
    expect(body2.data[0].type).toBe(PromptType.Text);

    // validate with version filter
    const response3 = await makeAPICall(
      "GET",
      `${baseURI}?version=1`,
      undefined,
      auth,
    );
    expect(response3.status).toBe(200);
    const body3 = response3.body as unknown as PromptsMetaResponse;

    expect(body3.data).toHaveLength(3);
    const prompt1v1 = body3.data.find(
      (promptMeta) => promptMeta.name === "prompt-1",
    );
    expect(prompt1v1?.lastConfig).toEqual({ version: 1 });
    expect(prompt1v1?.type).toBe(PromptType.Text);
  });

  it("should respect the fromUpdatedAt and toUpdatedAt filters on GET /prompts", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const { projectId: otherProjectId } = await createOrgProjectAndApiKey();

    await Promise.all(
      getMockPrompts(projectId, otherProjectId).map(createPromptInDB),
    );
    // to and from
    const from = new Date("2024-01-02T00:00:00.000Z");
    const to = new Date("2024-01-04T00:00:00.000Z");
    const response = await makeAPICall(
      "GET",
      `${baseURI}?fromUpdatedAt=${from.toISOString()}&toUpdatedAt=${to.toISOString()}`,
      undefined,
      auth,
    );
    expect(response.status).toBe(200);
    const body = response.body as unknown as PromptsMetaResponse;

    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("prompt-1");
    expect(body.data[0].lastUpdatedAt).toBe("2024-01-02T00:00:00.000Z");
    expect(body.data[0].versions.length).toBe(1);

    expect(body.meta.totalItems).toBe(1);

    // only from
    const response2 = await makeAPICall(
      "GET",
      `${baseURI}?fromUpdatedAt=${from.toISOString()}`,
      undefined,
      auth,
    );
    expect(response2.status).toBe(200);
    const body2 = response2.body as unknown as PromptsMetaResponse;

    expect(body2.data).toHaveLength(1);
    expect(body2.data[0].name).toBe("prompt-1");
    expect(body2.data[0].lastUpdatedAt).toBe("2024-01-04T00:00:00.000Z");
    expect(body2.data[0].versions.length).toBe(2);

    expect(body2.meta.totalItems).toBe(1);

    // only to
    const response3 = await makeAPICall(
      "GET",
      `${baseURI}?toUpdatedAt=${to.toISOString()}`,
      undefined,
      auth,
    );
    expect(response3.status).toBe(200);
    const body3 = response3.body as unknown as PromptsMetaResponse;

    expect(body3.data).toHaveLength(3);
    expect(body3.data[0].name).toBe("prompt-1");
    expect(body3.data[0].lastUpdatedAt).toBe("2024-01-02T00:00:00.000Z");
    expect(body3.data[0].versions.length).toBe(2);

    expect(body3.data[1].name).toBe("prompt-2");
    expect(body3.data[1].lastUpdatedAt).toBe("2000-03-01T00:00:00.000Z");
    expect(body3.data[1].versions.length).toBe(3);

    expect(body3.data[2].name).toBe("prompt-3");
    expect(body3.data[2].lastUpdatedAt).toBe("2000-01-01T00:00:00.000Z");
    expect(body3.data[2].versions.length).toBe(1);

    expect(body3.meta.totalItems).toBe(3);
  });

  describe("Unresolved prompt fetching via public API (resolve parameter)", () => {
    it("should return resolved prompt by default (backward compatibility)", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      // Create child prompt
      const childPromptName = "child-prompt-" + nanoid();
      await createPrompt({
        name: childPromptName,
        prompt: "I am a child prompt",
        labels: ["production"],
        config: {},
        projectId,
        createdBy: "user-1",
        prisma,
      });

      // Create parent prompt with dependency
      const parentPromptName = "parent-prompt-" + nanoid();
      const parentContent = `Parent prompt with dependency: @@@langfusePrompt:name=${childPromptName}|label=production@@@`;

      await createPrompt({
        name: parentPromptName,
        prompt: parentContent,
        labels: ["production"],
        config: {},
        projectId,
        createdBy: "user-1",
        prisma,
      });

      // Fetch without resolve parameter (default should be resolved)
      const response = await makeAPICall(
        "GET",
        `${baseURI}/${encodeURIComponent(parentPromptName)}?version=1`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      const body = response.body as Prompt;
      // Should be resolved (no @@@langfusePrompt tags)
      expect(body.prompt).not.toContain("@@@langfusePrompt");
      expect(body.prompt).toContain("I am a child prompt");
    });

    it("should return resolved prompt when resolve=true", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      // Create child prompt
      const childPromptName = "child-prompt-" + nanoid();
      await createPrompt({
        name: childPromptName,
        prompt: "Child content",
        labels: ["production"],
        config: {},
        projectId,
        createdBy: "user-1",
        prisma,
      });

      // Create parent prompt with dependency
      const parentPromptName = "parent-prompt-" + nanoid();
      const parentContent = `Parent: @@@langfusePrompt:name=${childPromptName}|label=production@@@`;

      await createPrompt({
        name: parentPromptName,
        prompt: parentContent,
        labels: ["production"],
        config: {},
        projectId,
        createdBy: "user-1",
        prisma,
      });

      // Explicitly set resolve=true
      const response = await makeAPICall(
        "GET",
        `${baseURI}/${encodeURIComponent(parentPromptName)}?version=1&resolve=true`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      const body = response.body as Prompt;
      expect(body.prompt).not.toContain("@@@langfusePrompt");
      expect(body.prompt).toContain("Child content");
    });

    it("should return unresolved prompt when resolve=false", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      // Create child prompt (doesn't matter, we won't resolve)
      const childPromptName = "child-prompt-" + nanoid();
      await createPrompt({
        name: childPromptName,
        prompt: "Child content",
        labels: ["production"],
        config: {},
        projectId,
        createdBy: "user-1",
        prisma,
      });

      // Create parent prompt with dependency
      const parentPromptName = "parent-prompt-" + nanoid();
      const parentContent = `Parent: @@@langfusePrompt:name=${childPromptName}|label=production@@@`;

      await createPrompt({
        name: parentPromptName,
        prompt: parentContent,
        labels: ["production"],
        config: {},
        projectId,
        createdBy: "user-1",
        prisma,
      });

      // Fetch with resolve=false
      const response = await makeAPICall(
        "GET",
        `${baseURI}/${encodeURIComponent(parentPromptName)}?version=1&resolve=false`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      const body = response.body as Prompt;
      // Should be unresolved (keep @@@langfusePrompt tags)
      expect(body.prompt).toContain("@@@langfusePrompt");
      expect(body.prompt).toContain(
        `@@@langfusePrompt:name=${childPromptName}|label=production@@@`,
      );
      expect(body.prompt).not.toContain("Child content");
    });

    it("should return unresolved chat prompt when resolve=false", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      // Create child prompt
      const childPromptName = "child-prompt-" + nanoid();
      await createPrompt({
        name: childPromptName,
        prompt: "Base instructions",
        labels: ["production"],
        config: {},
        projectId,
        createdBy: "user-1",
        prisma,
      });

      // Create parent chat prompt with dependency
      const parentPromptName = "parent-chat-prompt-" + nanoid();
      const chatMessages = [
        {
          role: "system",
          content: `System: @@@langfusePrompt:name=${childPromptName}|label=production@@@`,
        },
        { role: "user", content: "User message" },
      ];

      await createPrompt({
        name: parentPromptName,
        prompt: chatMessages,
        labels: ["production"],
        config: {},
        projectId,
        createdBy: "user-1",
        type: PromptType.Chat,
        prisma,
      });

      // Fetch with resolve=false
      const response = await makeAPICall(
        "GET",
        `${baseURI}/${encodeURIComponent(parentPromptName)}?version=1&resolve=false`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      const body = response.body as Prompt;
      expect(body.type).toBe("chat");
      // Verify the chat messages still contain unresolved tags
      const messages = body.prompt as Array<{ role: string; content: string }>;
      expect(messages[0].content).toContain("@@@langfusePrompt");
      expect(messages[0].content).toContain(
        `@@@langfusePrompt:name=${childPromptName}|label=production@@@`,
      );
    });

    it("should work with production label when no version specified and resolve=false", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      // Create child prompt
      const childPromptName = "child-prompt-" + nanoid();
      await createPromptInDB({
        name: childPromptName,
        prompt: "Child",
        labels: ["production"],
        version: 1,
        config: {},
        projectId,
        createdBy: "user-1",
      });

      // Create parent prompt with production label
      const parentPromptName = "parent-prompt-" + nanoid();
      const parentContent = `Parent: @@@langfusePrompt:name=${childPromptName}|label=production@@@`;

      await createPromptInDB({
        name: parentPromptName,
        prompt: parentContent,
        labels: ["production"],
        version: 1,
        config: {},
        projectId,
        createdBy: "user-1",
      });

      // Fetch without version (should get production label) with resolve=false
      const response = await makeAPICall(
        "GET",
        `${baseURI}/${encodeURIComponent(parentPromptName)}?resolve=false`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      const body = response.body as Prompt;
      expect(body.labels).toContain("production");
      expect(body.prompt).toContain("@@@langfusePrompt");
    });
  });
});

describe("PATCH api/public/v2/prompts/[promptName]/versions/[version]", () => {
  let triggerId: string;
  let actionId: string;

  afterAll(async () => {
    await disconnectQueues();
  });

  it("should update the labels of a prompt", async () => {
    const { projectId: newProjectId, auth: newAuth } =
      await createOrgProjectAndApiKey();

    const { actionId: newActionId, triggerId: newTriggerId } =
      await setupTriggerAndAction(newProjectId);

    const originalPrompt = await prisma.prompt.create({
      data: {
        name: "prompt-1",
        projectId: newProjectId,
        version: 1,
        labels: ["production"],
        createdBy: "user-test",
        prompt: "prompt-1",
      },
    });

    const response = await makeAPICall(
      "PATCH",
      `${baseURI}/prompt-1/versions/1`,
      {
        newLabels: ["new-label"],
      },
      newAuth,
    );

    expect(response.status).toBe(200);

    const updatedPrompt = await prisma.prompt.findUnique({
      where: {
        id: originalPrompt.id,
      },
    });
    expect(updatedPrompt?.labels).toContain("production");
    expect(updatedPrompt?.labels).toContain("new-label");
    expect(updatedPrompt?.labels).toHaveLength(2);

    // check that the action execution is created
    await waitForExpect(async () => {
      const actionExecution = await prisma.automationExecution.findFirst({
        where: {
          projectId: newProjectId,
          triggerId: newTriggerId,
          actionId: newActionId,
        },
      });
      expect(actionExecution).not.toBeNull();
      expect(actionExecution?.status).toBe("PENDING");
      expect(actionExecution?.sourceId).toBe(originalPrompt.id);
    });
  });

  it("should remove label from previous version when adding to new version", async () => {
    const { projectId: newProjectId, auth: newAuth } =
      await createOrgProjectAndApiKey();

    const { actionId: newActionId, triggerId: newTriggerId } =
      await setupTriggerAndAction(newProjectId);
    actionId = newActionId;
    triggerId = newTriggerId;

    // Create version 1 with "production" label
    await prisma.prompt.create({
      data: {
        name: "prompt-1",
        projectId: newProjectId,
        version: 1,
        labels: ["production"],
        createdBy: "user-test",
        prompt: "prompt-1",
      },
    });

    // Create version 2 initially without the label
    await prisma.prompt.create({
      data: {
        name: "prompt-1",
        projectId: newProjectId,
        version: 2,
        labels: [],
        createdBy: "user-test",
        prompt: "prompt-1",
      },
    });

    // Add "production" label to version 2
    const response = await makeAPICall(
      "PATCH",
      `${baseURI}/prompt-1/versions/2`,
      {
        newLabels: ["production"],
      },
      newAuth,
    );

    expect(response.status).toBe(200);
    const responseBody = response.body as unknown as Prompt;
    expect(responseBody.labels).toEqual(["production"]);

    // Check version 2 got the label
    const promptV2 = await prisma.prompt.findFirst({
      where: {
        projectId: newProjectId,
        name: "prompt-1",
        version: 2,
      },
    });
    expect(promptV2?.labels).toEqual(["production"]);

    // Check version 1 had the label removed
    const promptV1 = await prisma.prompt.findFirst({
      where: {
        projectId: newProjectId,
        name: "prompt-1",
        version: 1,
      },
    });
    expect(promptV1?.labels).toEqual([]);

    await waitForExpect(async () => {
      const actionExecution = await prisma.automationExecution.findFirst({
        where: {
          projectId: newProjectId,
          triggerId,
          actionId,
          sourceId: promptV2?.id,
        },
      });
      expect(actionExecution).not.toBeNull();
      expect(actionExecution?.status).toBe("PENDING");
      expect(actionExecution?.sourceId).toBe(promptV2?.id);

      const actionExecution2 = await prisma.automationExecution.findFirst({
        where: {
          projectId: newProjectId,
          triggerId,
          actionId,
          sourceId: promptV1?.id,
        },
      });
      expect(actionExecution2).not.toBeNull();
      expect(actionExecution2?.status).toBe("PENDING");
      expect(actionExecution2?.sourceId).toBe(promptV1?.id);
    });
  });

  it("trying to set 'latest' label results in 400 error", async () => {
    const { projectId: newProjectId, auth: newAuth } =
      await createOrgProjectAndApiKey();
    // Create initial prompt version
    await prisma.prompt.create({
      data: {
        name: "prompt-1",
        projectId: newProjectId,
        version: 1,
        labels: [],
        createdBy: "user-test",
        prompt: "prompt-1",
      },
    });

    // Try to set "latest" label
    const response = await makeAPICall(
      "PATCH",
      `${baseURI}/prompt-1/versions/1`,
      {
        newLabels: ["latest"],
      },
      newAuth,
    );

    expect(response.status).toBe(400);
  });

  it("updating non existing prompt results in 404", async () => {
    const { auth: newAuth } = await createOrgProjectAndApiKey();

    // Try to update non-existing prompt
    const response = await makeAPICall(
      "PATCH",
      `${baseURI}/non-existing-prompt/versions/1`,
      {
        newLabels: ["production"],
      },
      newAuth,
    );

    expect(response.status).toBe(404);
  });

  describe("prompt composability", () => {
    it("can create a prompt with dependencies linked via label", async () => {
      const { projectId: newProjectId, auth: newAuth } =
        await createOrgProjectAndApiKey();

      // Create child prompt
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "child-prompt",
          prompt: "I am a child prompt",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // Create parent prompt with dependency
      const parentPromptContent =
        "Parent prompt with dependency: @@@langfusePrompt:name=child-prompt|label=production@@@";
      const response = await makeAPICall(
        "POST",
        baseURI,
        {
          name: "parent-prompt",
          prompt: parentPromptContent,
          type: "text",
        },
        newAuth,
      );

      expect(response.status).toBe(201);

      // Verify dependency was created
      const dependencies = await prisma.promptDependency.findMany({
        where: {
          projectId: newProjectId,
          childName: "child-prompt",
        },
      });

      expect(dependencies.length).toBe(1);
      expect(dependencies[0].childLabel).toBe("production");

      // Get the resolved prompt
      const getResponse = await makeAPICall(
        "GET",
        `${baseURI}/parent-prompt?version=1`,
        undefined,
        newAuth,
      );

      expect(getResponse.status).toBe(200);
      const responseBody = getResponse.body as unknown as Prompt;
      const parsedPrompt = responseBody.prompt as string;

      // Verify the resolution graph is returned with the correct structure
      const parentId = responseBody.id;

      expect(responseBody.resolutionGraph).toEqual({
        root: {
          name: "parent-prompt",
          version: 1,
          id: parentId,
        },
        dependencies: {
          [parentId]: [
            {
              name: "child-prompt",
              version: 1,
              id: expect.any(String),
            },
          ],
        },
      });

      // Verify the dependency was resolved correctly
      expect(parsedPrompt).toBe(
        "Parent prompt with dependency: I am a child prompt",
      );

      // Create another version of the child prompt with the same name and production label
      // This will automatically strip the production label from the previous version
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "child-prompt",
          prompt: "I am an updated child prompt",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // Get the resolved prompt again to check if it now uses the new version
      const getResponseAfterUpdate = await makeAPICall(
        "GET",
        `${baseURI}/parent-prompt?version=1`,
        undefined,
        newAuth,
      );

      expect(getResponseAfterUpdate.status).toBe(200);
      const responseBodyAfterUpdate =
        getResponseAfterUpdate.body as unknown as Prompt;
      const parsedPromptAfterUpdate = responseBodyAfterUpdate.prompt as string;

      expect(parsedPromptAfterUpdate).toBe(
        "Parent prompt with dependency: I am an updated child prompt",
      );

      expect(responseBodyAfterUpdate.resolutionGraph).toEqual({
        root: {
          name: "parent-prompt",
          version: 1,
          id: parentId,
        },
        dependencies: {
          [parentId]: [
            {
              name: "child-prompt",
              version: 2,
              id: expect.any(String),
            },
          ],
        },
      });

      const childPrompts = await prisma.prompt.findMany({
        where: {
          projectId: newProjectId,
          name: "child-prompt",
        },
        orderBy: {
          version: "asc",
        },
      });

      expect(childPrompts.length).toBe(2);
    });

    it("resolves prompt dependencies correctly when linked via label", async () => {
      const { auth: newAuth } = await createOrgProjectAndApiKey();

      // Create child prompt
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "nested-child",
          prompt: "I am a nested child",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // Create intermediate prompt with dependency
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "intermediate",
          prompt:
            "Intermediate with dependency: @@@langfusePrompt:name=nested-child|label=production@@@",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // Create parent prompt with dependency
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "nested-parent",
          prompt:
            "Parent with nested dependency: @@@langfusePrompt:name=intermediate|label=production@@@",
          type: "text",
        },
        newAuth,
      );

      // Get the resolved prompt
      const response = await makeAPICall(
        "GET",
        `${baseURI}/nested-parent?version=1`,
        undefined,
        newAuth,
      );

      expect(response.status).toBe(200);
      const responseBody = response.body as unknown as Prompt;
      expect(responseBody.prompt).toBe(
        "Parent with nested dependency: Intermediate with dependency: I am a nested child",
      );
    });

    it("resolves prompt dependencies correctly when linked via version", async () => {
      const { auth: newAuth } = await createOrgProjectAndApiKey();

      // Create child prompt with version
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "version-linked-child",
          prompt: "I am version 3 of the child prompt",
          type: "text",
          version: 1,
          labels: ["production"],
        },
        newAuth,
      );

      // Create parent prompt with version-specific dependency
      const parentPromptContent =
        "Parent with version dependency: @@@langfusePrompt:name=version-linked-child|version=1@@@";

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "version-linked-parent",
          prompt: parentPromptContent,
          type: "text",
        },
        newAuth,
      );

      // Get the resolved prompt
      const response = await makeAPICall(
        "GET",
        `${baseURI}/version-linked-parent?version=1`,
        undefined,
        newAuth,
      );

      expect(response.status).toBe(200);
      const responseBody = response.body as unknown as Prompt;
      expect(responseBody.prompt).toBe(
        "Parent with version dependency: I am version 3 of the child prompt",
      );
      expect(responseBody.prompt).not.toContain("@@@langfusePrompt");
    });

    it("detects circular dependencies", async () => {
      const { auth: newAuth } = await createOrgProjectAndApiKey();

      // Create first prompt
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "circular-a",
          prompt: "Prompt A without dependency",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // Create second prompt that depends on the first - this should be rejected due to circular dependency
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "circular-b",
          prompt:
            "Prompt B with dependency: @@@langfusePrompt:name=circular-a|label=production@@@",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      const circularResponse = await makeAPICall(
        "POST",
        baseURI,
        {
          name: "circular-a",
          prompt:
            "Prompt A with dependency: @@@langfusePrompt:name=circular-b|label=production@@@",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // The second call should be rejected with a 400 error
      expect(circularResponse.status).toBe(400);
      const circularResponseBody = circularResponse.body as unknown as {
        error: string;
      };
      expect(JSON.stringify(circularResponseBody)).toContain("circular");
    });

    it("handles deeply nested dependencies (3+ levels)", async () => {
      //const { auth: newAuth } = await createOrgProjectAndApiKey();
      const newAuth = undefined;

      // Create level 3 (deepest) prompts
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "level-3-a",
          prompt: "I am level 3 prompt A",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "level-3-b",
          prompt: "I am level 3 prompt B",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // Create level 2 prompt that depends on level 3 prompts
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "level-2",
          prompt:
            "Level 2 with dependencies: @@@langfusePrompt:name=level-3-a|label=production@@@ and @@@langfusePrompt:name=level-3-b|label=production@@@",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // Create level 1 prompt that depends on level 2
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "level-1",
          prompt:
            "Level 1 with dependency: @@@langfusePrompt:name=level-2|label=production@@@",
          type: "text",
        },
        newAuth,
      );

      // Get the resolved prompt
      const response = await makeAPICall(
        "GET",
        `${baseURI}/level-1?version=1`,
        undefined,
        newAuth,
      );

      expect(response.status).toBe(200);
      const responseBody = response.body as unknown as Prompt;
      expect(responseBody.prompt).toBe(
        "Level 1 with dependency: Level 2 with dependencies: I am level 3 prompt A and I am level 3 prompt B",
      );
      expect(responseBody.prompt).not.toContain("@@@langfusePrompt");
    });

    it("handles multiple dependencies at the same level", async () => {
      const { auth: newAuth } = await createOrgProjectAndApiKey();

      // Create multiple child prompts
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "child-a",
          prompt: "I am child prompt A",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "child-b",
          prompt: "I am child prompt B",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "child-c",
          prompt: "I am child prompt C",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // Create parent prompt with multiple dependencies
      const parentPromptContent = `Parent prompt with multiple dependencies: First: @@@langfusePrompt:name=child-a|label=production@@@ Second: @@@langfusePrompt:name=child-b|label=production@@@ Third: @@@langfusePrompt:name=child-c|label=production@@@`;

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "multi-parent",
          prompt: parentPromptContent,
          type: "text",
        },
        newAuth,
      );

      // Get the resolved prompt
      const response = await makeAPICall(
        "GET",
        `${baseURI}/multi-parent?version=1`,
        undefined,
        newAuth,
      );

      expect(response.status).toBe(200);
      const responseBody = response.body as unknown as Prompt;
      expect(responseBody.prompt).toBe(
        "Parent prompt with multiple dependencies: First: I am child prompt A Second: I am child prompt B Third: I am child prompt C",
      );
      expect(responseBody.prompt).not.toContain("@@@langfusePrompt");
    });

    it("handles version-specific dependencies", async () => {
      const { auth: newAuth } = await createOrgProjectAndApiKey();

      // Create child prompt with multiple versions
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "versioned-child",
          prompt: "I am version 1",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "versioned-child",
          prompt: "I am version 2",
          type: "text",
          version: 2,
          labels: ["production"],
        },
        newAuth,
      );

      // Create parent prompt with version-specific dependency
      const parentPromptContent =
        "Parent with version dependency: @@@langfusePrompt:name=versioned-child|version=1@@@";

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "version-parent",
          prompt: parentPromptContent,
          type: "text",
        },
        newAuth,
      );

      // Get the resolved prompt
      const response = await makeAPICall(
        "GET",
        `${baseURI}/version-parent?version=1`,
        undefined,
        newAuth,
      );

      expect(response.status).toBe(200);
      const responseBody = response.body as unknown as Prompt;
      expect(responseBody.prompt).toBe(
        "Parent with version dependency: I am version 1",
      );
      expect(responseBody.prompt).not.toContain("@@@langfusePrompt");
    });

    it("resolves prompt dependencies in chat prompts correctly", async () => {
      const { auth: newAuth } = await createOrgProjectAndApiKey();

      // Create child text prompt
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "chat-child-text",
          prompt: "I am a text prompt used in a chat prompt",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // Create parent chat prompt with dependency
      const chatPromptContent = [
        { role: "system", content: "You are a helpful assistant" },
        {
          role: "user",
          content:
            "Here's some context: @@@langfusePrompt:name=chat-child-text|label=production@@@",
        },
      ];

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "chat-parent",
          prompt: chatPromptContent,
          type: "chat",
        },
        newAuth,
      );

      // Get the resolved prompt
      const response = await makeAPICall(
        "GET",
        `${baseURI}/chat-parent?version=1`,
        undefined,
        newAuth,
      );

      expect(response.status).toBe(200);
      const responseBody = response.body as unknown as Prompt;
      expect(responseBody.prompt).toEqual([
        { role: "system", content: "You are a helpful assistant" },
        {
          role: "user",
          content:
            "Here's some context: I am a text prompt used in a chat prompt",
        },
      ]);
      expect(JSON.stringify(responseBody.prompt)).not.toContain(
        "@@@langfusePrompt",
      );
    });

    it("supports nested dependencies in chat prompts", async () => {
      const { auth: newAuth } = await createOrgProjectAndApiKey();

      // Create nested child text prompt
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "nested-child",
          prompt: "I am a nested child prompt",
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // Create intermediate text prompt with dependency
      const intermediatePromptContent =
        "Intermediate prompt with dependency: @@@langfusePrompt:name=nested-child|label=production@@@";

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "intermediate-prompt",
          prompt: intermediatePromptContent,
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // Create parent chat prompt with dependency to intermediate
      const chatPromptContent = [
        { role: "system", content: "You are a helpful assistant" },
        {
          role: "user",
          content:
            "Here's some context: @@@langfusePrompt:name=intermediate-prompt|label=production@@@",
        },
      ];

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "nested-chat-parent",
          prompt: chatPromptContent,
          type: "chat",
        },
        newAuth,
      );

      // Get the resolved prompt
      const response = await makeAPICall(
        "GET",
        `${baseURI}/nested-chat-parent?version=1`,
        undefined,
        newAuth,
      );

      expect(response.status).toBe(200);
      const responseBody = response.body as unknown as Prompt;
      const parsedPrompt = responseBody.prompt;
      expect(parsedPrompt).toEqual([
        { role: "system", content: "You are a helpful assistant" },
        {
          role: "user",
          content:
            "Here's some context: Intermediate prompt with dependency: I am a nested child prompt",
        },
      ]);
      expect(JSON.stringify(parsedPrompt)).not.toContain("@@@langfusePrompt");
    });

    it("should ignore invalid prompt tags", async () => {
      const { auth: newAuth } = await createOrgProjectAndApiKey();

      // Create a prompt with invalid dependency tags
      const invalidTagPromptContent = JSON.stringify({
        text: "This prompt has invalid tags: @@@langfusePrompt:invalid@@@, @@@langfusePrompt:name=missing-type@@@, @@@langfusePrompt:name=no-version-or-label@@@",
      });

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "prompt-with-invalid-tags",
          prompt: invalidTagPromptContent,
          type: "text",
        },
        newAuth,
      );

      // Get the resolved prompt
      const response = await makeAPICall(
        "GET",
        `${baseURI}/prompt-with-invalid-tags?version=1`,
        undefined,
        newAuth,
      );

      expect(response.status).toBe(200);
      const responseBody = response.body as unknown as Prompt;
      const parsedPrompt = JSON.parse(responseBody.prompt as string);

      // The invalid tags should remain unchanged in the resolved prompt
      expect(parsedPrompt.text).toContain("@@@langfusePrompt:invalid@@@");
      expect(parsedPrompt.text).toContain(
        "@@@langfusePrompt:name=missing-type@@@",
      );
      expect(parsedPrompt.text).toContain(
        "@@@langfusePrompt:name=no-version-or-label@@@",
      );
    });

    it("should handle duplicate dependency tags for the same prompt", async () => {
      const { auth: newAuth } = await createOrgProjectAndApiKey();

      // Create a parent prompt
      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "parent-prompt",
          prompt: "I am a parent prompt",
          type: "text",
        },
        newAuth,
      );

      // Create a prompt with duplicate dependency tags
      const duplicateTagsPromptContent =
        "This prompt has duplicate tags: @@@langfusePrompt:name=parent-prompt|version=1@@@ and again @@@langfusePrompt:name=parent-prompt|version=1@@@";

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "prompt-with-duplicate-tags",
          prompt: duplicateTagsPromptContent,
          type: "text",
        },
        newAuth,
      );

      // Get the resolved prompt
      const response = await makeAPICall(
        "GET",
        `${baseURI}/prompt-with-duplicate-tags?version=1`,
        undefined,
        newAuth,
      );

      expect(response.status).toBe(200);

      const responseBody = response.body as unknown as Prompt;
      const parsedPrompt = responseBody.prompt as string;

      // The duplicate tags should be resolved to the same prompt
      expect(parsedPrompt).toBe(
        "This prompt has duplicate tags: I am a parent prompt and again I am a parent prompt",
      );
    });

    it("should handle special characters in prompt names", async () => {
      const { auth: newAuth } = await createOrgProjectAndApiKey();

      // Create prompts with special characters in names
      const specialCharPrompts = [
        { name: "prompt-with-hyphens", prompt: "Hyphen content", type: "text" },
        {
          name: "prompt_with_underscores",
          prompt: "Underscore content",
          type: "text",
        },
        { name: "prompt.with.dots", prompt: "Dot content", type: "text" },
        {
          name: "prompt123WithNumbers",
          prompt: "Number content",
          type: "text",
        },
        { name: "prompt with spaces", prompt: "Space content", type: "text" },
        { name: "prompt/with/slashes", prompt: "Slash content", type: "text" },
      ];

      // Create all the special character prompts
      for (const promptData of specialCharPrompts) {
        const response = await makeAPICall(
          "POST",
          baseURI,
          promptData,
          newAuth,
        );
        expect(response.status).toBe(201);
      }

      // Create a prompt that references all the special character prompts
      const dependencyContent = `
      Reference prompts with special chars:
      @@@langfusePrompt:name=prompt-with-hyphens|version=1@@@
      @@@langfusePrompt:name=prompt_with_underscores|version=1@@@
      @@@langfusePrompt:name=prompt.with.dots|version=1@@@
      @@@langfusePrompt:name=prompt123WithNumbers|version=1@@@
      @@@langfusePrompt:name=prompt with spaces|version=1@@@
      @@@langfusePrompt:name=prompt/with/slashes|version=1@@@
    `;

      await makeAPICall(
        "POST",
        baseURI,
        {
          name: "prompt-with-special-char-dependencies",
          prompt: dependencyContent,
          type: "text",
        },
        newAuth,
      );

      // Get the resolved prompt
      const response = await makeAPICall(
        "GET",
        `${baseURI}/prompt-with-special-char-dependencies?version=1`,
        undefined,
        newAuth,
      );

      expect(response.status).toBe(200);
      const responseBody = response.body as unknown as Prompt;
      const parsedPrompt = responseBody.prompt as string;

      // Verify the exact resolved prompt string
      const expectedPrompt = `
      Reference prompts with special chars:
      Hyphen content
      Underscore content
      Dot content
      Number content
      Space content
      Slash content
    `;
      expect(parsedPrompt).toBe(expectedPrompt);
    }, 10_000);

    it("should disallow a prompt that references itself", async () => {
      const { auth } = await createOrgProjectAndApiKey();

      // First, create the prompt without self-reference
      const initialPromptName = "self-referencing-prompt";
      const initialPromptContent = "This is the initial content";

      const createResponse = await makeAPICall(
        "POST",
        baseURI,
        {
          name: initialPromptName,
          prompt: initialPromptContent,
          type: "text",
        },
        auth,
      );

      expect(createResponse.status).toBe(201);

      // Now try to update the prompt to include a reference to itself
      const selfReferenceContent = `This prompt references itself:
      @@@langfusePrompt:name=self-referencing-prompt|version=1@@@
      And that's it!`;

      const updateResponse = await makeAPICall(
        "POST",
        baseURI,
        {
          name: initialPromptName,
          prompt: selfReferenceContent,
          type: "text",
        },
        auth,
      );

      // Expect the request to fail with a 400 Bad Request
      expect(updateResponse.status).toBe(400);
      // Check that the response contains an error about circular dependency
      expect(JSON.stringify(updateResponse.body)).toContain(
        "Circular dependency",
      );
    });

    it("should return an error when a dependent prompt doesn't exist", async () => {
      const { auth: newAuth } = await createOrgProjectAndApiKey();

      // Create a prompt that references a non-existent prompt
      const promptWithNonExistentDependency = `This prompt references a non-existent prompt:
      @@@langfusePrompt:name=non-existent-prompt|version=1@@@
      End of prompt.`;

      // Create the prompt with the non-existent dependency
      const createResponse = await makeAPICall(
        "POST",
        baseURI,
        {
          name: "prompt-with-missing-dependency",
          prompt: promptWithNonExistentDependency,
          type: "text",
        },
        newAuth,
      );

      // The creation should succeed as dependencies are resolved at retrieval time
      expect(createResponse.status).toBe(400);

      expect(JSON.stringify(createResponse.body)).toContain("not found");
    });

    it("should return an error when a dependent prompt exists but in a different project", async () => {
      // Create two different organizations with their own projects
      await createOrgProjectAndApiKey();
      const { auth: auth2 } = await createOrgProjectAndApiKey();

      // Create a prompt in the first project
      const foreignProjectId = randomUUID();
      await prisma.project.upsert({
        where: { id: foreignProjectId },
        update: {
          name: "test-foreign-llm-app",
          orgId: "seed-org-id",
        },
        create: {
          id: foreignProjectId,
          name: "test-foreign-llm-app",
          orgId: "seed-org-id",
        },
      });
      await prisma.prompt.create({
        data: {
          name: "cross-project-prompt",
          prompt: "This prompt belongs to project 1",
          type: "TEXT",
          version: 1,
          projectId: foreignProjectId,
          createdBy: "test-user",
        },
      });

      // Create a prompt in the second project that references the prompt from the first project
      const promptWithCrossProjectDependency = `This prompt references a prompt from another project: @@@langfusePrompt:name=cross-project-prompt|version=1@@@ End of prompt.`;

      // Create the prompt with the cross-project dependency
      const createResponse = await makeAPICall(
        "POST",
        baseURI,
        {
          name: "prompt-with-cross-project-dependency",
          prompt: promptWithCrossProjectDependency,
          type: "text",
        },
        auth2,
      );

      expect(createResponse.status).toBe(400);

      expect(JSON.stringify(createResponse.body)).toContain("not found");

      await prisma.project.delete({
        where: { id: foreignProjectId },
      });
    });

    it("should throw an error if MAX_PROMPT_NESTING_DEPTH is exceeded", async () => {
      const { auth: newAuth } = await createOrgProjectAndApiKey();

      // Create prompts with increasing depth
      for (let i = MAX_PROMPT_NESTING_DEPTH; i >= 1; i--) {
        const promptName = `depth-${i}`;
        let promptContent = "";

        if (i === MAX_PROMPT_NESTING_DEPTH) {
          // The deepest prompt has no dependencies
          promptContent = "I am the deepest prompt";
        } else {
          // Each prompt depends on the one deeper than it
          promptContent = `Level ${i} with dependency: @@@langfusePrompt:name=depth-${i + 1}|label=production@@@`;
        }

        const response = await makeAPICall(
          "POST",
          baseURI,
          {
            name: promptName,
            prompt: promptContent,
            type: "text",
            labels: ["production"],
          },
          newAuth,
        );

        expect(response.status).toBe(201);
      }

      // Try to create the depth-0 prompt which would exceed the max nesting depth
      const promptName = "depth-0";
      const promptContent = `Level 0 with dependency: @@@langfusePrompt:name=depth-1|label=production@@@`;

      const createResponse = await makeAPICall(
        "POST",
        baseURI,
        {
          name: promptName,
          prompt: promptContent,
          type: "text",
          labels: ["production"],
        },
        newAuth,
      );

      // Expect an error response
      expect(createResponse.status).toBe(400);
      expect(JSON.stringify(createResponse.body)).toContain(
        "Maximum nesting depth exceeded",
      );
    }, 10_000);
  });

  describe("DELETE /api/public/v2/prompts/:promptName", () => {
    it("deletes all versions of a prompt", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
      const name = "deletePrompt" + uuidv4();
      await prisma.prompt.createMany({
        data: [
          {
            id: uuidv4(),
            name,
            prompt: "p1",
            labels: ["production"],
            version: 1,
            projectId,
            createdBy: "user",
            config: {},
            type: "TEXT",
          },
          {
            id: uuidv4(),
            name,
            prompt: "p2",
            labels: [],
            version: 2,
            projectId,
            createdBy: "user",
            config: {},
            type: "TEXT",
          },
        ],
      });

      const res = await makeAPICall(
        "DELETE",
        `${baseURI}/${encodeURIComponent(name)}`,
        undefined,
        auth,
      );
      expect(res.status).toBe(204);

      const remaining = await prisma.prompt.findMany({
        where: { projectId, name },
      });
      expect(remaining.length).toBe(0);
    });

    it("deletes by label and version", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
      const name = "deletePromptFiltered" + uuidv4();
      await prisma.prompt.createMany({
        data: [
          {
            id: uuidv4(),
            name,
            prompt: "p1",
            labels: ["production"],
            version: 1,
            projectId,
            createdBy: "user",
            config: {},
            type: "TEXT",
          },
          {
            id: uuidv4(),
            name,
            prompt: "p2",
            labels: ["dev"],
            version: 2,
            projectId,
            createdBy: "user",
            config: {},
            type: "TEXT",
          },
        ],
      });

      const res1 = await makeAPICall(
        "DELETE",
        `${baseURI}/${encodeURIComponent(name)}?version=1`,
        undefined,
        auth,
      );
      expect(res1.status).toBe(204);

      let remaining = await prisma.prompt.findMany({
        where: { projectId, name },
      });
      expect(remaining.length).toBe(1);

      const res2 = await makeAPICall(
        "DELETE",
        `${baseURI}/${encodeURIComponent(name)}?label=dev`,
        undefined,
        auth,
      );
      expect(res2.status).toBe(204);

      remaining = await prisma.prompt.findMany({ where: { projectId, name } });
      expect(remaining.length).toBe(0);
    });

    it("deletes a prompt with slashes in name (folder structure)", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
      const name = "folder/subfolder/deletePrompt" + uuidv4();
      await prisma.prompt.create({
        data: {
          id: uuidv4(),
          name,
          prompt: "prompt in folder",
          labels: ["production"],
          version: 1,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      });

      const res = await makeAPICall(
        "DELETE",
        `${baseURI}/${encodeURIComponent(name)}`,
        undefined,
        auth,
      );
      expect(res.status).toBe(204);

      const remaining = await prisma.prompt.findMany({
        where: { projectId, name },
      });
      expect(remaining.length).toBe(0);
    });

    it("returns 400 when deleting prompt with dependencies", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
      const childName = "childPrompt" + uuidv4();
      const parentName = "parentPrompt" + uuidv4();

      // Create child prompt
      await prisma.prompt.create({
        data: {
          id: uuidv4(),
          name: childName,
          prompt: "I am a child prompt",
          labels: ["production"],
          version: 1,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      });

      // Create parent prompt that depends on child
      const parentPrompt = await prisma.prompt.create({
        data: {
          id: uuidv4(),
          name: parentName,
          prompt: `Parent with dependency: @@@langfusePrompt:name=${childName}|version=1@@@`,
          labels: ["production"],
          version: 1,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      });

      // Create dependency relationship
      await prisma.promptDependency.create({
        data: {
          parentId: parentPrompt.id,
          childName: childName,
          childVersion: 1,
          projectId,
        },
      });

      // Try to delete child prompt (should fail because parent depends on it)
      const res = await makeAPICall(
        "DELETE",
        `${baseURI}/${encodeURIComponent(childName)}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      // @ts-expect-error
      expect(res.body.message).toContain("depending on");
      // @ts-expect-error
      expect(res.body.message).toContain(parentName);

      // Verify child was NOT deleted
      const remaining = await prisma.prompt.findMany({
        where: { projectId, name: childName },
      });
      expect(remaining.length).toBe(1);
    });

    it("handles mixed version and label dependencies correctly", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
      const childName = "childPrompt" + uuidv4();
      const parent1Name = "parent1" + uuidv4();
      const parent2Name = "parent2" + uuidv4();
      const parent3Name = "parent3" + uuidv4();

      // Create child prompt with 2 versions
      // v1: labels ["production", "latest"]
      // v2: labels ["production"]
      await prisma.prompt.create({
        data: {
          id: uuidv4(),
          name: childName,
          prompt: "child v1",
          labels: ["production", "latest"],
          version: 1,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      });

      await prisma.prompt.create({
        data: {
          id: uuidv4(),
          name: childName,
          prompt: "child v2",
          labels: ["production"],
          version: 2,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      });

      // parent1: depends on childPrompt v1 (version-based - SHOULD BLOCK)
      const parent1 = await prisma.prompt.create({
        data: {
          id: uuidv4(),
          name: parent1Name,
          prompt: `Depends on @@@langfusePrompt:name=${childName}|version=1@@@`,
          labels: ["production"],
          version: 1,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      });
      await prisma.promptDependency.create({
        data: {
          parentId: parent1.id,
          childName,
          childVersion: 1,
          projectId,
        },
      });

      // parent2: depends on childPrompt|label=production (label-based - should NOT block, v2 has it)
      const parent2 = await prisma.prompt.create({
        data: {
          id: uuidv4(),
          name: parent2Name,
          prompt: `Depends on @@@langfusePrompt:name=${childName}|label=production@@@`,
          labels: ["production"],
          version: 1,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      });
      await prisma.promptDependency.create({
        data: {
          parentId: parent2.id,
          childName,
          childLabel: "production",
          projectId,
        },
      });

      // parent3: depends on childPrompt|label=latest (label-based - SHOULD BLOCK, only v1 has it)
      const parent3 = await prisma.prompt.create({
        data: {
          id: uuidv4(),
          name: parent3Name,
          prompt: `Depends on @@@langfusePrompt:name=${childName}|label=latest@@@`,
          labels: ["production"],
          version: 1,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      });
      await prisma.promptDependency.create({
        data: {
          parentId: parent3.id,
          childName,
          childLabel: "latest",
          projectId,
        },
      });

      // Try to delete v1 - should fail because:
      // - parent1 depends on v1 specifically (version-based) ✓ BLOCKS
      // - parent3 depends on "latest" label (only v1 has it) ✓ BLOCKS
      // - parent2 depends on "production" label (v2 also has it) ✓ DOES NOT BLOCK
      const res = await makeAPICall(
        "DELETE",
        `${baseURI}/${encodeURIComponent(childName)}?version=1`,
        undefined,
        auth,
      );

      expect(res.status).toBe(400);
      // @ts-expect-error
      expect(res.body.message).toContain("depending on");
      // @ts-expect-error - Should mention blocking parent names
      expect(res.body.message).toContain(parent1Name);
      // @ts-expect-error
      expect(res.body.message).toContain(parent3Name);
      // @ts-expect-error - Should NOT mention parent2 (its dependency still satisfied)
      expect(res.body.message).not.toContain(parent2Name);
    });

    it('reattaches "latest" label to highest remaining version when deleted', async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
      const promptName = "testPrompt" + uuidv4();

      // Create 3 versions: v1 (dev), v2 (production, latest), v3 (dev)
      await prisma.prompt.create({
        data: {
          id: uuidv4(),
          name: promptName,
          prompt: "version 1",
          labels: ["dev"],
          version: 1,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      });

      await prisma.prompt.create({
        data: {
          id: uuidv4(),
          name: promptName,
          prompt: "version 2",
          labels: ["production", "latest"],
          version: 2,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      });

      await prisma.prompt.create({
        data: {
          id: uuidv4(),
          name: promptName,
          prompt: "version 3",
          labels: ["dev"],
          version: 3,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      });

      // Delete v2 (which has "latest" label)
      const res = await makeAPICall(
        "DELETE",
        `${baseURI}/${encodeURIComponent(promptName)}?version=2`,
        undefined,
        auth,
      );

      expect(res.status).toBe(204);

      // Verify v2 was deleted
      const remaining = await prisma.prompt.findMany({
        where: { projectId, name: promptName },
        orderBy: { version: "asc" },
      });

      expect(remaining.length).toBe(2);
      expect(remaining.map((p) => p.version)).toEqual([1, 3]);

      // Verify "latest" label was moved to v3 (highest remaining version)
      const v3 = remaining.find((p) => p.version === 3);
      expect(v3?.labels).toContain("latest");
      expect(v3?.labels).toContain("dev");

      // Verify v1 still only has "dev" label
      const v1 = remaining.find((p) => p.version === 1);
      expect(v1?.labels).toEqual(["dev"]);
    });
  });

  describe("Parsing prompt dependency tags", () => {
    it("should extract prompt dependency tags with version", () => {
      const content =
        "This is a test with @@@langfusePrompt:name=test|version=1@@@ dependency";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "test",
        version: 1,
        type: "version",
      });
    });
    it("should handle prompt names with special characters", () => {
      const content = `
        @@@langfusePrompt:name=test-with-hyphens|version=1@@@
        @@@langfusePrompt:name=test with spaces|label=production@@@
        @@@langfusePrompt:name=test_with_underscores|version=2@@@
        @@@langfusePrompt:name=test.with.dots|label=staging@@@
        @@@langfusePrompt:name=test123WithNumbers|version=3@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({
        name: "test-with-hyphens",
        version: 1,
        type: "version",
      });
      expect(result[1]).toEqual({
        name: "test with spaces",
        label: "production",
        type: "label",
      });
      expect(result[2]).toEqual({
        name: "test_with_underscores",
        version: 2,
        type: "version",
      });
      expect(result[3]).toEqual({
        name: "test.with.dots",
        label: "staging",
        type: "label",
      });
      expect(result[4]).toEqual({
        name: "test123WithNumbers",
        version: 3,
        type: "version",
      });
    });

    it("should extract prompt dependency tags with label", () => {
      const content =
        "This is a test with @@@langfusePrompt:name=test|label=production@@@ dependency";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "test",
        label: "production",
        type: "label",
      });
    });

    it("should extract multiple prompt dependency tags", () => {
      const content = `
        First dependency: @@@langfusePrompt:name=first|version=1@@@
        Second dependency: @@@langfusePrompt:name=second|label=staging@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "first",
        version: 1,
        type: "version",
      });
      expect(result[1]).toEqual({
        name: "second",
        label: "staging",
        type: "label",
      });
    });

    it("should ignore invalid prompt dependency tags", () => {
      const content = `
        Valid: @@@langfusePrompt:name=valid|version=1@@@
        Invalid: @@@langfusePrompt:version=1@@@
        Also invalid: @@@langfusePrompt:name=invalid|something=else@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "valid",
        version: 1,
        type: "version",
      });
    });

    it("should return empty array when no tags are found", () => {
      const content = "This is a test with no dependency tags";
      const result = parsePromptDependencyTags(content);

      expect(result).toEqual([]);
    });

    it("should handle tags with special characters in name", () => {
      const content =
        "Tag with special chars @@@langfusePrompt:name=test-prompt_123|version=2@@@";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "test-prompt_123",
        version: 2,
        type: "version",
      });
    });

    it("should handle tags with special characters in label", () => {
      const content =
        "Tag with special chars @@@langfusePrompt:name=test|label=prod-v1.0_beta@@@";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "test",
        label: "prod-v1.0_beta",
        type: "label",
      });
    });

    it("should correctly coerce version to number", () => {
      const content =
        "Version as string @@@langfusePrompt:name=test|version=123@@@";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "test",
        version: 123,
        type: "version",
      });
      expect(typeof (result[0] as any).version).toBe("number");
    });

    it("should handle tags with spaces in the content", () => {
      const content =
        "Tag with spaces @@@langfusePrompt:name=my prompt|label=production label@@@";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "my prompt",
        label: "production label",
        type: "label",
      });
    });

    it("should handle multiple tags with the same name but different versions/labels", () => {
      const content = `
        @@@langfusePrompt:name=same|version=1@@@
        @@@langfusePrompt:name=same|version=2@@@
        @@@langfusePrompt:name=same|label=production@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: "same", version: 1, type: "version" });
      expect(result[1]).toEqual({ name: "same", version: 2, type: "version" });
      expect(result[2]).toEqual({
        name: "same",
        label: "production",
        type: "label",
      });
    });

    it("should handle tags with the PRODUCTION_LABEL constant value", () => {
      const content = "@@@langfusePrompt:name=test|label=production@@@";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "test",
        label: "production",
        type: "label",
      });
    });

    it("should ignore malformed tags that don't match the regex pattern", () => {
      const content = `
        Valid: @@@langfusePrompt:name=valid|version=1@@@
        Malformed: @@langfusePrompt:name=test|version=1@@
        Also malformed: @@@langfusePrompt:name=test|version=1
        And: langfusePrompt:name=test|version=1@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "valid",
        version: 1,
        type: "version",
      });
    });
    it("should not parse langfuseMedia tags as prompt dependency tags", () => {
      const content = `
        @@@langfusePrompt:name=valid|version=1@@@
        @@@langfuseMedia:type=image/jpeg|id=cc48838a-3da8-4ca4-a007-2cf8df930e69|source=base64@@@
        @@@langfusePrompt:name=another|label=production@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "valid",
        version: 1,
        type: "version",
      });
      expect(result[1]).toEqual({
        name: "another",
        label: "production",
        type: "label",
      });
    });

    it("should reject tags where name is not the first parameter", () => {
      const content = `
        Valid: @@@langfusePrompt:name=valid|version=1@@@
        Invalid: @@@langfusePrompt:version=1|name=test@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "valid",
        version: 1,
        type: "version",
      });
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

const getMockPrompts = (projectId: string, otherProjectId: string) => [
  // Prompt with multiple versions
  {
    name: "prompt-1",
    labels: ["production"],
    prompt: "prompt-1",
    createdBy: "user-test",
    projectId,
    config: { version: 1 },
    version: 1,
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  },
  {
    name: "prompt-1",
    labels: ["production", "version2"],
    prompt: "prompt-1",
    createdBy: "user-test",
    projectId,
    config: { version: 2 },
    version: 2,
    updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  },
  {
    name: "prompt-1",
    labels: ["production"],
    prompt: "prompt-1",
    createdBy: "user-test",
    projectId,
    config: { version: 4 },
    version: 4,
    updatedAt: new Date("2024-01-04T00:00:00.000Z"),
  },

  // Prompt with different labels
  {
    name: "prompt-2",
    labels: ["production"],
    prompt: "prompt-2",
    createdBy: "user-test",
    projectId,
    config: {},
    version: 1,
    updatedAt: new Date("2000-01-01T00:00:00.000Z"),
  },
  {
    name: "prompt-2",
    labels: ["staging"],
    prompt: "prompt-2",
    createdBy: "user-test",
    projectId,
    config: {},
    version: 2,
    updatedAt: new Date("2000-03-01T00:00:00.000Z"),
  },
  {
    name: "prompt-2",
    labels: ["dev"],
    prompt: "prompt-2",
    createdBy: "user-test",
    projectId,
    config: {},
    version: 3,
    updatedAt: new Date("2000-02-01T00:00:00.000Z"),
  },

  // Prompt with different labels
  {
    name: "prompt-3",
    labels: ["production"],
    prompt: "prompt-2",
    createdBy: "user-test",
    projectId,
    config: {},
    tags: ["tag-1"],
    type: PromptType.Chat,
    version: 1,
    updatedAt: new Date("2000-01-01T00:00:00.000Z"),
  },

  // Prompt in different project
  {
    name: "prompt-4",
    labels: ["production"],
    prompt: "prompt-2",
    createdBy: "user-test",
    projectId: otherProjectId,
    config: {},
    version: 1,
    updatedAt: new Date("2000-01-01T00:00:00.000Z"),
  },
];
