/** @jest-environment node */

import { prisma } from "@/src/server/db";
import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4 } from "uuid";
import { type Prompt } from "@prisma/client";

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
    expect(fetchedObservations.body.version).toBe(1);
    expect(fetchedObservations.body.isActive).toBe(true);
    expect(fetchedObservations.body.createdBy).toBe("user-1");
  });

  it("should fetch active prompt only", async () => {
    const promptId = uuidv4();

    await prisma.prompt.create({
      data: {
        id: promptId,
        name: "prompt-name",
        prompt: "prompt",
        isActive: false,
        version: 1,
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

    expect(fetchedObservations.status).toBe(404);
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
    expect(fetchedObservations.body.version).toBe(2);
    expect(fetchedObservations.body.isActive).toBe(true);
    expect(fetchedObservations.body.createdBy).toBe("user-1");
  });

  it("should create and fetch a prompt", async () => {
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
    expect(fetchedObservations.body.version).toBe(1);
    expect(fetchedObservations.body.isActive).toBe(true);
    expect(fetchedObservations.body.createdBy).toBe("API");
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
    typeof prompt.createdBy === "string"
  );
};
