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
import { parsePromptDependencyTags } from "@langfuse/shared";
import { nanoid } from "ai";

import { type PromptsMetaResponse } from "@/src/features/prompts/server/actions/getPromptsMeta";
import {
  createOrgProjectAndApiKey,
  getObservationById,
  MAX_PROMPT_NESTING_DEPTH,
} from "@langfuse/shared/src/server";
import { randomUUID } from "node:crypto";

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
  afterAll(pruneDatabase);

  describe("when fetching a prompt", () => {
    beforeAll(pruneDatabase);

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

      // Delay to allow for async processing
      await new Promise((resolve) => setTimeout(resolve, 500));

      const dbGeneration = await getObservationById(generationId, projectId);

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
        commitMessage: "chore: setup initial prompt",
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
      expect(validatedPrompt.commitMessage).toBe("chore: setup initial prompt");
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
      expect(postResponse2.body.error).toBe("InvalidRequestError");

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
      await prisma.organization.upsert({
        where: { id: "other-org" },
        create: { id: "other-org", name: "other-org" },
        update: {},
      });
      await prisma.organizationMembership.upsert({
        where: {
          orgId_userId: { orgId: "other-org", userId: "user-test" },
        },
        create: { userId: "user-test", orgId: "other-org", role: "OWNER" },
        update: { role: "OWNER" },
      });
      await prisma.project.upsert({
        where: { id: otherProjectId },
        create: {
          id: otherProjectId,
          name: "demo-app",
          orgId: "other-org",
        },
        update: { name: "demo-app", orgId: "other-org" },
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
      expect(promptMeta1.labels).toEqual(["production", "version2"]);
      expect(promptMeta1.tags).toEqual([]);
      expect(promptMeta1.lastUpdatedAt).toBeDefined();

      // Validate prompt-2 meta
      expect(promptMeta2.name).toBe("prompt-2");
      expect(promptMeta2.versions).toEqual([1, 2, 3]);
      expect(promptMeta2.labels).toEqual(["dev", "production", "staging"]);
      expect(promptMeta2.tags).toEqual([]);
      expect(promptMeta2.lastUpdatedAt).toBeDefined();

      // Validate prompt-3 meta
      expect(promptMeta3.name).toBe("prompt-3");
      expect(promptMeta3.versions).toEqual([1]);
      expect(promptMeta3.labels).toEqual(["production"]);
      expect(promptMeta3.tags).toEqual(["tag-1"]);
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
      const response = await makeAPICall("GET", `${baseURI}?name=prompt-1`);
      expect(response.status).toBe(200);
      const body = response.body as unknown as PromptsMetaResponse;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("prompt-1");
      expect(body.data[0].versions).toEqual([1, 2, 4]);
      expect(body.data[0].labels).toEqual(["production", "version2"]);
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

  it("should fetch lastConfig correctly for a prompt with multiple versions", async () => {
    // no filters
    const response = await makeAPICall("GET", `${baseURI}`);
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

    const prompt2 = body.data.find(
      (promptMeta) => promptMeta.name === "prompt-2",
    );
    expect(prompt2).toBeDefined();
    expect(prompt2?.lastConfig).toEqual({});

    // validate with label filter
    const response2 = await makeAPICall("GET", `${baseURI}?label=version2`);
    expect(response2.status).toBe(200);
    const body2 = response2.body as unknown as PromptsMetaResponse;

    expect(body2.data).toHaveLength(1);
    expect(body2.data[0].name).toBe("prompt-1");
    expect(body2.data[0].lastConfig).toEqual({ version: 2 });

    // validate with version filter
    const response3 = await makeAPICall("GET", `${baseURI}?version=1`);
    expect(response3.status).toBe(200);
    const body3 = response3.body as unknown as PromptsMetaResponse;

    expect(body3.data).toHaveLength(3);
    const prompt1v1 = body3.data.find(
      (promptMeta) => promptMeta.name === "prompt-1",
    );
    expect(prompt1v1?.lastConfig).toEqual({ version: 1 });
  });

  it("should respect the fromUpdatedAt and toUpdatedAt filters on GET /prompts", async () => {
    // to and from
    const from = new Date("2024-01-02T00:00:00.000Z");
    const to = new Date("2024-01-04T00:00:00.000Z");
    const response = await makeAPICall(
      "GET",
      `${baseURI}?fromUpdatedAt=${from.toISOString()}&toUpdatedAt=${to.toISOString()}`,
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
});

describe("PATCH api/public/v2/prompts/[promptName]/versions/[version]", () => {
  it("should update the labels of a prompt", async () => {
    const { projectId: newProjectId, auth: newAuth } =
      await createOrgProjectAndApiKey();

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
  });

  it("should remove label from previous version when adding to new version", async () => {
    const { projectId: newProjectId, auth: newAuth } =
      await createOrgProjectAndApiKey();

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
    beforeEach(() => pruneDatabase());
    afterAll(() => pruneDatabase());

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

const mockPrompts = [
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
    version: 1,
    updatedAt: new Date("2000-01-01T00:00:00.000Z"),
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
    updatedAt: new Date("2000-01-01T00:00:00.000Z"),
  },
];
