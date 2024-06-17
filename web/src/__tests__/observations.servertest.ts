/** @jest-environment node */

import { v4 as uuidv4 } from "uuid";

import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { ModelUsageUnit } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { type ObservationView } from "@langfuse/shared";

describe("/api/public/observations API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should fetch all observations", async () => {
    await pruneDatabase();

    const traceId = uuidv4();

    await prisma.trace.create({
      data: {
        id: traceId,
        name: "trace-name",
        userId: "user-1",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
    });

    const model = await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000010",
        outputPrice: "0.0000020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        projectId: null,
        unit: ModelUsageUnit.Tokens,
      },
    });

    const prompt = await prisma.prompt.create({
      data: {
        name: "prompt-name",
        prompt: "prompt-one",
        isActive: false,
        version: 1,
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        createdBy: "user-1",
      },
    });

    await prisma.observation.create({
      data: {
        id: uuidv4(),
        traceId: traceId,
        name: "generation-name",
        startTime: new Date("2021-01-01T00:00:00.000Z"),
        endTime: new Date("2021-01-01T00:00:00.000Z"),
        model: "gpt-3.5-turbo",
        modelParameters: { key: "value" },
        input: { key: "input" },
        output: { key: "output" },
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        version: "2.0.0",
        type: "GENERATION",
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        internalModel: "gpt-3.5-turbo",
        unit: ModelUsageUnit.Tokens,
        promptId: prompt.id,
      },
    });

    const fetchedObservations = await makeAPICall(
      "GET",
      "/api/public/observations",
      undefined,
    );

    expect(fetchedObservations.status).toBe(200);

    if (!isObservationList(fetchedObservations.body)) {
      throw new Error(
        "Expected body to be an array of observations" +
          JSON.stringify(fetchedObservations.body),
      );
    }

    expect(fetchedObservations.body.data.length).toBe(1);
    expect(fetchedObservations.body.data[0]?.traceId).toBe(traceId);
    expect(fetchedObservations.body.data[0]?.input).toEqual({ key: "input" });
    expect(fetchedObservations.body.data[0]?.output).toEqual({ key: "output" });
    expect(fetchedObservations.body.data[0]?.model).toEqual("gpt-3.5-turbo");
    expect(fetchedObservations.body.data[0]?.modelId).toEqual(model.id);
    expect(
      fetchedObservations.body.data[0]?.calculatedInputCost,
    ).toBeGreaterThan(0);
    expect(
      fetchedObservations.body.data[0]?.calculatedOutputCost,
    ).toBeGreaterThan(0);
    expect(
      fetchedObservations.body.data[0]?.calculatedTotalCost,
    ).toBeGreaterThan(0);
    expect(fetchedObservations.body.data[0]?.promptId).toBe(prompt.id);
  });
  it("should fetch all observations, filtered by generations", async () => {
    await pruneDatabase();

    const traceId = uuidv4();

    await prisma.trace.create({
      data: {
        id: traceId,
        name: "trace-name",
        userId: "user-1",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
    });

    await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000010",
        outputPrice: "0.0000020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        projectId: null,
        unit: ModelUsageUnit.Tokens,
      },
    });

    await prisma.observation.create({
      data: {
        id: uuidv4(),
        traceId: traceId,
        name: "generation-name",
        startTime: new Date("2021-01-01T00:00:00.000Z"),
        endTime: new Date("2021-01-01T00:00:00.000Z"),
        model: "gpt-3.5-turbo",
        internalModel: "gpt-3.5-turbo",
        modelParameters: { key: "value" },
        input: { key: "input" },
        output: { key: "output" },
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        version: "2.0.0",
        unit: ModelUsageUnit.Tokens,
        type: "GENERATION",
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
      },
    });

    await prisma.observation.create({
      data: {
        id: uuidv4(),
        traceId: traceId,
        name: "generation-name",
        startTime: new Date("2021-01-01T00:00:00.000Z"),
        endTime: new Date("2021-01-01T00:00:00.000Z"),
        modelParameters: { key: "value" },
        input: { key: "input" },
        output: { key: "output" },
        version: "2.0.0",
        type: "SPAN",
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
      },
    });

    const fetchedObservations = await makeAPICall(
      "GET",
      "/api/public/observations?type=GENERATION",
      undefined,
    );

    console.log(fetchedObservations.body);

    expect(fetchedObservations.status).toBe(200);

    if (!isObservationList(fetchedObservations.body)) {
      throw new Error("Expected body to be an array of observations");
    }

    expect(fetchedObservations.body.data.length).toBe(1);
    expect(fetchedObservations.body.data[0]?.traceId).toBe(traceId);
    expect(fetchedObservations.body.data[0]?.input).toEqual({ key: "input" });
    expect(fetchedObservations.body.data[0]?.output).toEqual({ key: "output" });
    expect(fetchedObservations.body.data[0]?.type).toEqual("GENERATION");
  });
});

const isObservationList = (val: unknown): val is ObservationResponse => {
  return (
    typeof val === "object" &&
    val !== null &&
    "data" in val &&
    Array.isArray(val.data) &&
    val.data.every(
      (element) =>
        typeof element === "object" &&
        element !== null &&
        "id" in element &&
        "traceId" in element &&
        "name" in element &&
        "startTime" in element &&
        "endTime" in element &&
        "model" in element &&
        "input" in element &&
        "output" in element &&
        "metadata" in element &&
        "version" in element &&
        "modelId" in element &&
        "inputPrice" in element &&
        "outputPrice" in element &&
        "totalPrice" in element &&
        "calculatedInputCost" in element &&
        "calculatedOutputCost" in element &&
        "calculatedTotalCost" in element,
    )
  );
};

type ObservationResponse = {
  data: ObservationView[];
};
