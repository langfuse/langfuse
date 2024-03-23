/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4 } from "uuid";

describe("/api/public/events API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());

  it("should create event after trace", async () => {
    await pruneDatabase();

    const traceId = uuidv4();

    await makeAPICall("POST", "/api/public/traces", {
      id: traceId,
      name: "trace-name",
      userId: "user-1",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
    });

    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    const eventId = uuidv4();
    const createEvent = await makeAPICall("POST", "/api/public/events", {
      id: eventId,
      traceId: traceId,
      name: "event-name",
      startTime: "2021-01-01T00:00:00.000Z",
      input: { input: "value" },
      output: { output: "value" },
      metadata: { meta: "value" },
      version: "2.0.0",
    });

    expect(createEvent.status).toBe(200);
    const dbEvent = await prisma.observation.findUnique({
      where: {
        id: eventId,
      },
    });

    expect(dbEvent?.id).toBe(eventId);
    expect(dbEvent?.traceId).toBe(traceId);
    expect(dbEvent?.name).toBe("event-name");
    expect(dbEvent?.startTime).toEqual(new Date("2021-01-01T00:00:00.000Z"));
    expect(dbEvent?.input).toEqual({ input: "value" });
    expect(dbEvent?.output).toEqual({ output: "value" });
    expect(dbEvent?.metadata).toEqual({ meta: "value" });
    expect(dbEvent?.version).toBe("2.0.0");
  });

  it("should create event before trace", async () => {
    await pruneDatabase();

    const traceId = uuidv4();
    const eventId = uuidv4();

    const createEvent = await makeAPICall("POST", "/api/public/events", {
      id: eventId,
      traceId: traceId,
      name: "event-name",
      startTime: "2021-01-01T00:00:00.000Z",
      input: { input: "value" },
      output: { output: "value" },
      metadata: { meta: "value" },
      version: "2.0.0",
    });

    expect(createEvent.status).toBe(200);
    const dbEvent = await prisma.observation.findUnique({
      where: {
        id: eventId,
      },
    });

    expect(dbEvent?.id).toBe(eventId);
    expect(dbEvent?.traceId).toBe(traceId);
    expect(dbEvent?.name).toBe("event-name");
    expect(dbEvent?.startTime).toEqual(new Date("2021-01-01T00:00:00.000Z"));
    expect(dbEvent?.input).toEqual({ input: "value" });
    expect(dbEvent?.output).toEqual({ output: "value" });
    expect(dbEvent?.metadata).toEqual({ meta: "value" });
    expect(dbEvent?.version).toBe("2.0.0");

    await makeAPICall("POST", "/api/public/traces", {
      id: traceId,
      name: "trace-name",
      userId: "user-1",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
    });

    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);
  });

  it("should create trace and ignore externalId and create event afterwards", async () => {
    await pruneDatabase();

    const traceId = uuidv4();

    const response = await makeAPICall("POST", "/api/public/traces", {
      externalId: traceId,
      name: "trace-name",
      userId: "user-1",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
    });

    expect(response.status).toBe(200);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.externalId).toBeNull();
    expect(dbTrace[0]?.id).not.toBe(traceId);

    const eventId = uuidv4();
    const createEvent = await makeAPICall("POST", "/api/public/events", {
      id: eventId,
      traceIdType: "EXTERNAL",
      traceId: dbTrace[0]?.id,
      name: "event-name",
      startTime: "2021-01-01T00:00:00.000Z",
      input: { input: "value" },
      output: { output: "value" },
      metadata: { meta: "value" },
      version: "2.0.0",
    });

    expect(createEvent.status).toBe(200);
    const dbEvent = await prisma.observation.findUnique({
      where: {
        id: eventId,
      },
    });

    expect(dbEvent?.id).toBe(eventId);
    expect(dbEvent?.traceId).toBe(dbTrace[0]?.id);
    expect(dbEvent?.name).toBe("event-name");
    expect(dbEvent?.startTime).toEqual(new Date("2021-01-01T00:00:00.000Z"));
    expect(dbEvent?.input).toEqual({ input: "value" });
    expect(dbEvent?.output).toEqual({ output: "value" });
    expect(dbEvent?.metadata).toEqual({ meta: "value" });
    expect(dbEvent?.version).toBe("2.0.0");
  });

  it("should create trace when creating span without existing trace", async () => {
    const eventName = uuidv4();

    const spanId = uuidv4();
    const createEvent = await makeAPICall("POST", "/api/public/events", {
      id: spanId,
      name: eventName,
      startTime: "2021-01-01T00:00:00.000Z",
      endTime: "2021-01-01T00:00:00.000Z",
      input: { input: "value" },
      output: { output: "value" },
      metadata: { meta: "value" },
      version: "2.0.0",
    });

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: eventName,
      },
    });

    expect(dbTrace.length).toBe(1);
    expect(dbTrace[0]?.name).toBe(eventName);

    expect(createEvent.status).toBe(200);
    const dbEvent = await prisma.observation.findUnique({
      where: {
        id: spanId,
      },
    });

    expect(dbEvent?.id).toBe(spanId);
    expect(dbEvent?.traceId).toBe(dbTrace[0]?.id);
    expect(dbEvent?.name).toBe(eventName);
    expect(dbEvent?.startTime).toEqual(new Date("2021-01-01T00:00:00.000Z"));
    expect(dbEvent?.input).toEqual({ input: "value" });
    expect(dbEvent?.output).toEqual({ output: "value" });
    expect(dbEvent?.metadata).toEqual({ meta: "value" });
    expect(dbEvent?.version).toBe("2.0.0");
  });

  it("should create event when creating generation without existing trace without traceId", async () => {
    const generationName = uuidv4();

    const spanId = uuidv4();
    const createSpan = await makeAPICall("POST", "/api/public/events", {
      id: spanId,
      name: generationName,
      startTime: "2021-01-01T00:00:00.000Z",
      input: { key: "value" },
      metadata: { key: "value" },
      version: "2.0.0",
    });

    const dbEvent = await prisma.observation.findFirstOrThrow({
      where: {
        name: generationName,
      },
    });

    const dbTrace = await prisma.trace.findMany({
      where: {
        id: dbEvent.traceId!,
      },
    });

    expect(dbTrace.length).toBe(1);
    expect(dbTrace[0]?.name).toBe(generationName);

    expect(createSpan.status).toBe(200);

    expect(dbEvent.id).toBe(spanId);
    expect(dbEvent.traceId).toBe(dbTrace[0]?.id);
    expect(dbEvent.name).toBe(generationName);
    expect(dbEvent.startTime).toEqual(new Date("2021-01-01T00:00:00.000Z"));
    expect(dbEvent.input).toEqual({ key: "value" });
    expect(dbEvent.metadata).toEqual({ key: "value" });
    expect(dbEvent.version).toBe("2.0.0");
  });
});
