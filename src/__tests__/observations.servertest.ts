/** @jest-environment node */

import { prisma } from "@/src/server/db";
import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4 } from "uuid";
import { type Observation } from "@prisma/client";

describe("/api/public/generations API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should create generation after trace", async () => {
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

    await prisma.observation.create({
      data: {
        id: uuidv4(),
        traceId: traceId,
        name: "generation-name",
        startTime: new Date("2021-01-01T00:00:00.000Z"),
        endTime: new Date("2021-01-01T00:00:00.000Z"),
        model: "model-name",
        modelParameters: { key: "value" },
        input: { key: "input" },
        metadata: { key: "output" },
        version: "2.0.0",
        type: "GENERATION",
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
      },
    });

    const fetchedObservations = await makeAPICall(
      "GET",
      "/api/public/observations",
      undefined,
    );

    expect(fetchedObservations.status).toBe(200);

    if (!isObservationList(fetchedObservations.body)) {
      throw new Error("Expected body to be an array of observations");
    }

    expect(fetchedObservations.body.length).toBe(1);
    expect(fetchedObservations.body[0]?.traceId).toBe(traceId);
    expect(fetchedObservations.body[0]?.input).toBe({ key: "input" });
    expect(fetchedObservations.body[0]?.output).toBe({ key: "output" });
  });
});

const isObservationList = (val: unknown): val is Observation[] =>
  Array.isArray(val) &&
  val.every(
    (element) =>
      typeof element === "object" &&
      element !== null &&
      "id" in element &&
      "traceId" in element &&
      "name" in element &&
      "startTime" in element &&
      "endTime" in element &&
      "model" in element &&
      "modelParameters" in element &&
      "input" in element &&
      "output" in element &&
      "metadata" in element &&
      "version" in element,
  );
