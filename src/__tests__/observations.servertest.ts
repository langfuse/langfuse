/** @jest-environment node */

import { prisma } from "@/src/server/db";
import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4 } from "uuid";

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
        input: { key: "value" },
        metadata: { key: "value" },
        version: "2.0.0",
      },
    });

    const fetchedObservations = await makeAPICall(
      "GET",
      "/api/public/observations",
      undefined,
    );

    expect(fetchedObservations.status).toBe(200);

    expect(fetchedObservations.body?.length).toBe(1);
    expect(fetchedObservations.body[0]?.trace_id).toBe(traceId);
  });
});
