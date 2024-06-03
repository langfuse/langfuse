/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4, v4 } from "uuid";
import { type Prompt } from "@langfuse/shared";
import {
  PromptSchema,
  PromptType,
  type ValidatedPrompt,
} from "@/src/features/prompts/server/utils/validation";

import { nanoid } from "ai";

import { type PromptsMetaResponse } from "@/src/features/prompts/server/actions/getPromptsMeta";

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
  tags?: string[];
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
      // @ts-expect-error
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

    it("should fetch the latest prompt if label is latest", async () => {
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
      );

      if (!isPrompt(fetchedPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(latestPromptParams, fetchedPrompt.body);

      const fetchedDefaultPrompt = await makeAPICall<Prompt>(
        "GET",
        `${baseURI}/${encodeURIComponent(promptName)}`,
        undefined,
      );

      expect(fetchedDefaultPrompt.status).toBe(200);

      if (!isPrompt(fetchedDefaultPrompt.body)) {
        throw new Error("Expected body to be a prompt");
      }

      testPromptEquality(productionPromptParams, fetchedDefaultPrompt.body);
    }),
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
      // @ts-expect-error
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
      expect(validatedPrompt.labels).toEqual(["production", "latest"]);
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
      // @ts-expect-error
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
      // @ts-expect-error
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
      // @ts-expect-error
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
      expect(validatedPrompt.labels).toEqual(["production", "latest"]);
      expect(validatedPrompt.createdBy).toBe("API");
      expect(validatedPrompt.config).toEqual({});

      // Check that the text prompt has not been created
      const getResponse2 = await makeAPICall(
        "GET",
        `${baseURI}/${promptName}?version=2`,
        undefined,
      );
      expect(getResponse2.status).toBe(404);
      // @ts-expect-error
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
      expect(fetchedThirdPrompt.body.labels).toEqual(["staging", "latest"]);
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

      expect(fetchedPrompt.body.name).toBe(promptName);
      expect(fetchedPrompt.body.prompt).toBe("prompt");
      expect(fetchedPrompt.body.type).toBe("text");
      expect(fetchedPrompt.body.version).toBe(1);
      expect(fetchedPrompt.body.labels).toEqual(["production", "latest"]);
      expect(fetchedPrompt.body.createdBy).toBe("API");
      expect(fetchedPrompt.body.config).toEqual({});
    });

    it("should update tags across versions", async () => {
      const promptName = "prompt-name" + nanoid();

      const createPromptVersion = async (tags?: string[]) => {
        await makeAPICall("POST", baseURI, {
          name: promptName,
          prompt: "This is a test prompt",
          type: PromptType.Text,
          ...(tags !== undefined && { tags: tags }),
        });
      };

      const fetchPromptVersion = async (version: number) => {
        const fetchedPrompt = await makeAPICall(
          "GET",
          `${baseURI}/${promptName}?version=${version}`,
          undefined,
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
  });

  describe("when fetching a prompt list", () => {
    const otherProjectPromptName = "prompt-5";

    beforeAll(async () => {
      pruneDatabase();
      // Create a prompt in a different project
      await prisma.user.upsert({
        where: { id: "user-test" },
        update: {
          name: "Demo User",
          email: "demo-test@langfuse.com",
          password: "password",
        },
        create: {
          id: "user-test",
          name: "Demo User",
          email: "demo-test@langfuse.com",
          password: "password",
        },
      });

      const otherProjectId = "239ad00f-562f-411d-af14-831c75ddd875";
      await prisma.project.upsert({
        where: { id: otherProjectId },
        create: {
          id: otherProjectId,
          name: "demo-app",
          projectMembers: {
            create: {
              role: "OWNER",
              userId: "user-test",
            },
          },
        },
        update: {},
      });

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
      await Promise.all(mockPrompts.map(createPromptInDB));
    });

    it("should only return prompts from the current project", async () => {
      // Add a prompt from a different project

      const response = await makeAPICall("GET", `${baseURI}`);
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
      const response = await makeAPICall("GET", `${baseURI}`);
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
      expect(promptMeta1.labels).toEqual(["production"]);
      expect(promptMeta1.tags).toEqual([]);

      // Validate prompt-2 meta
      expect(promptMeta2.name).toBe("prompt-2");
      expect(promptMeta2.versions).toEqual([1, 2, 3]);
      expect(promptMeta2.labels).toEqual(["dev", "production", "staging"]);
      expect(promptMeta2.tags).toEqual([]);

      // Validate prompt-3 meta
      expect(promptMeta3.name).toBe("prompt-3");
      expect(promptMeta3.versions).toEqual([1]);
      expect(promptMeta3.labels).toEqual(["production"]);
      expect(promptMeta3.tags).toEqual(["tag-1"]);

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
      const response = await makeAPICall("GET", `${baseURI}?name=prompt-1`);
      expect(response.status).toBe(200);
      const body = response.body as unknown as PromptsMetaResponse;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("prompt-1");
      expect(body.data[0].versions).toEqual([1, 2, 4]);
      expect(body.data[0].labels).toEqual(["production"]);
      expect(body.data[0].tags).toEqual([]);

      // Validate pagination
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(1);
      expect(body.meta.totalItems).toBe(1);

      // Test with a different name
      const response2 = await makeAPICall("GET", `${baseURI}?name=prompt-2`);
      expect(response2.status).toBe(200);
      const body2 = response2.body as unknown as PromptsMetaResponse;

      expect(body2.data).toHaveLength(1);
      expect(body2.data[0].name).toBe("prompt-2");
      expect(body2.data[0].versions).toEqual([1, 2, 3]);
      expect(body2.data[0].labels).toEqual(["dev", "production", "staging"]);
      expect(body2.data[0].tags).toEqual([]);

      // Validate pagination
      expect(body2.meta.page).toBe(1);
      expect(body2.meta.limit).toBe(10);
      expect(body2.meta.totalPages).toBe(1);
      expect(body2.meta.totalItems).toBe(1);

      // Return 200 with empty list if name does not exist
      const response3 = await makeAPICall(
        "GET",
        `${baseURI}?name=non-existent`,
      );
      expect(response3.status).toBe(200);
      // @ts-expect-error
      expect(response3.body.data).toEqual([]);
    });

    it("should fetch a prompt meta list with tag filter", async () => {
      const response = await makeAPICall("GET", `${baseURI}?tag=tag-1`);
      expect(response.status).toBe(200);
      const body = response.body as unknown as PromptsMetaResponse;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("prompt-3");
      expect(body.data[0].versions).toEqual([1]);
      expect(body.data[0].labels).toEqual(["production"]);
      expect(body.data[0].tags).toEqual(["tag-1"]);

      // Validate pagination
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(1);
      expect(body.meta.totalItems).toBe(1);

      // Return 200 with empty list if tag does not exist
      const response3 = await makeAPICall("GET", `${baseURI}?tag=non-existent`);
      expect(response3.status).toBe(200);
      // @ts-expect-error
      expect(response3.body.data).toEqual([]);
    });

    it("should fetch a prompt meta list with label filter", async () => {
      const response = await makeAPICall("GET", `${baseURI}?label=production`);
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

      // Validate pagination
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(1);
      expect(body.meta.totalItems).toBe(3);

      // Test with a different label
      const response2 = await makeAPICall("GET", `${baseURI}?label=dev`);
      expect(response2.status).toBe(200);
      const body2 = response2.body as unknown as PromptsMetaResponse;

      expect(body2.data).toHaveLength(1);
      expect(body2.data[0].name).toBe("prompt-2");
      expect(body2.data[0].versions).toEqual([3]); // Only version 3 should be present as it is the only one with dev label
      expect(body2.data[0].labels).toEqual(["dev"]); // Only dev label should be present
      expect(body2.data[0].tags).toEqual([]);

      // Validate pagination
      expect(body2.meta.page).toBe(1);
      expect(body2.meta.limit).toBe(10);
      expect(body2.meta.totalPages).toBe(1);
      expect(body2.meta.totalItems).toBe(1);

      // Return 200 with empty list if label does not exist
      const response3 = await makeAPICall(
        "GET",
        `${baseURI}?label=non-existent`,
      );
      expect(response3.status).toBe(200);
      // @ts-expect-error
      expect(response3.body.data).toEqual([]);
    });
  });

  it("should fetch a prompt meta list with pagination", async () => {
    const response = await makeAPICall("GET", `${baseURI}?page=1&limit=1`);
    expect(response.status).toBe(200);
    const body = response.body as unknown as PromptsMetaResponse;

    expect(body.data).toHaveLength(1);
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(1);
    expect(body.meta.totalPages).toBe(3);
    expect(body.meta.totalItems).toBe(3);
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

const mockPrompts = [
  // Prompt with multiple versions
  {
    name: "prompt-1",
    labels: ["production"],
    prompt: "prompt-1",
    createdBy: "user-test",
    projectId,
    config: {},
    version: 1,
  },
  {
    name: "prompt-1",
    labels: ["production"],
    prompt: "prompt-1",
    createdBy: "user-test",
    projectId,
    config: {},
    version: 2,
  },
  {
    name: "prompt-1",
    labels: ["production"],
    prompt: "prompt-1",
    createdBy: "user-test",
    projectId,
    config: {},
    version: 4,
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
  },
  {
    name: "prompt-2",
    labels: ["staging"],
    prompt: "prompt-2",
    createdBy: "user-test",
    projectId,
    config: {},
    version: 2,
  },
  {
    name: "prompt-2",
    labels: ["dev"],
    prompt: "prompt-2",
    createdBy: "user-test",
    projectId,
    config: {},
    version: 3,
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
    version: 1,
  },

  // Prompt in different project
  {
    name: "prompt-4",
    labels: ["production"],
    prompt: "prompt-2",
    createdBy: "user-test",
    projectId: "239ad00f-562f-411d-af14-831c75ddd875",
    config: {},
    version: 1,
  },
];
