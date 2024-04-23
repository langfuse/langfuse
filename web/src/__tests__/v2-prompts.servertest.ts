/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4 } from "uuid";

interface GetPromptsAPIResponse {
  data: Array<{
    id: string;
    name: string;
    latestVersion: number;
    projectId: string;
    prompt: string;
    updatedAt: string;
    createdAt: string;
    isActive: boolean;
  }>;
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

interface GetSinglePromptAPIResponse
  extends Array<{
    id: string;
    createdAt: string;
    updatedAt: string;
    projectId: string;
    createdBy: string;
    prompt: string;
    name: string;
    version: number;
    type: string;
    isActive: boolean;
    config: {
      topP: number;
      temperature: number;
      frequencyPenalty: number;
    };
    tags: Array<string>;
  }> {}

const populateDatabase = async () => {
  const secondProjectId = uuidv4();

  await prisma.project.create({
    data: {
      id: secondProjectId,
      name: "project-name",
    },
  });

  await prisma.prompt.create({
    data: {
      id: uuidv4(),
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

  await prisma.prompt.create({
    data: {
      id: uuidv4(),
      name: "prompt-name",
      prompt: "newer-prompt",
      isActive: false,
      version: 2,
      config: {
        temperature: 0.2,
      },
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      createdBy: "user-1",
    },
  });

  await prisma.prompt.create({
    data: {
      id: uuidv4(),
      name: "prompt-name-2",
      prompt: "prompt-2",
      isActive: false,
      version: 1,
      config: {
        temperature: 0.1,
      },
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      createdBy: "user-1",
    },
  });

  await prisma.prompt.create({
    data: {
      id: uuidv4(),
      name: "prompt-name-3",
      prompt: "prompt-3",
      isActive: true,
      version: 1,
      config: {
        temperature: 0.1,
      },
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      createdBy: "user-1",
    },
  });

  await prisma.prompt.create({
    data: {
      id: uuidv4(),
      name: "different-project-prompt",
      prompt: "different-project-prompt-content",
      isActive: true,
      version: 1,
      config: {
        temperature: 0.1,
      },
      projectId: secondProjectId,
      createdBy: "user-1",
    },
  });
};

describe("/api/public/v2/prompts API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());

  it("should return a list of prompts for the current project", async () => {
    await populateDatabase();

    const fetchedPrompts = await makeAPICall<GetPromptsAPIResponse>(
      "GET",
      "/api/public/v2/prompts",
    );

    expect(fetchedPrompts.status).toBe(200);
    expect(fetchedPrompts.body.data.length).toBe(3);
  });

  it("should page correctly", async () => {
    await populateDatabase();

    const fetchedPrompts = await makeAPICall<GetPromptsAPIResponse>(
      "GET",
      "/api/public/v2/prompts?limit=2",
    );
    expect(fetchedPrompts.status).toBe(200);
    expect(fetchedPrompts.body.data.length).toBe(2);
    expect(fetchedPrompts.body.meta.totalItems).toBe(3);
    expect(fetchedPrompts.body.meta.totalPages).toBe(2);

    const secondPage = await makeAPICall<GetPromptsAPIResponse>(
      "GET",
      "/api/public/v2/prompts?limit=2&page=2",
    );

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.length).toBe(1);
    expect(secondPage.body.meta.totalItems).toBe(3);
    expect(secondPage.body.meta.totalPages).toBe(2);
  });

  it("should return latest version only & sort by name desc", async () => {
    await populateDatabase();

    const fetchedPrompts = await makeAPICall<GetPromptsAPIResponse>(
      "GET",
      "/api/public/v2/prompts",
    );

    expect(fetchedPrompts.status).toBe(200);
    expect(fetchedPrompts.body.data.length).toBe(3);
    expect(fetchedPrompts.body.data[0].name).toBe("prompt-name");
    expect(fetchedPrompts.body.data[0].prompt).toBe("newer-prompt");
  });
});

describe("/api/public/v2/prompts/[promptName] API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());

  it("should return a list of prompt versions for a single prompt", async () => {
    await populateDatabase();

    const fetchedPrompt = await makeAPICall<GetSinglePromptAPIResponse>(
      "GET",
      "/api/public/v2/prompts/prompt-name",
    );

    expect(fetchedPrompt.status).toBe(200);
    expect(fetchedPrompt.body.length).toBe(2);
  });

  it("should filter by active", async () => {
    await populateDatabase();

    const fetchedPrompt = await makeAPICall<GetSinglePromptAPIResponse>(
      "GET",
      "/api/public/v2/prompts/prompt-name?active=true",
    );

    expect(fetchedPrompt.status).toBe(200);
    expect(fetchedPrompt.body.length).toBe(1);

    const prompt = fetchedPrompt.body[0];
    expect(prompt.name).toBe("prompt-name");
    expect(prompt.version).toBe(1);
    expect(prompt.isActive).toBe(true);
  });

  it("should filter by version", async () => {
    await populateDatabase();

    const fetchedPrompt = await makeAPICall<GetSinglePromptAPIResponse>(
      "GET",
      "/api/public/v2/prompts/prompt-name?version=2",
    );

    expect(fetchedPrompt.status).toBe(200);
    expect(fetchedPrompt.body.length).toBe(1);

    const prompt = fetchedPrompt.body[0];
    expect(prompt.version).toBe(2);
    expect(prompt.isActive).toBe(false);
  });

  it("should not allow both version and active to be used together", async () => {
    await populateDatabase();

    const fetchedPrompt = await makeAPICall<GetSinglePromptAPIResponse>(
      "GET",
      "/api/public/v2/prompts/prompt-name?active=true&version=1",
    );
    expect(fetchedPrompt.status).toBe(400);
  });

  it("should return 404 if version not found", async () => {
    await populateDatabase();
    const fetchedPrompt = await makeAPICall<GetSinglePromptAPIResponse>(
      "GET",
      "/api/public/v2/prompts/prompt-name?version=3",
    );
    expect(fetchedPrompt.status).toBe(404);
  });
});
