/** @jest-environment node */

import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { prisma } from "@/src/server/db";

describe("/api/public/traces API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should create", async () => {
    await pruneDatabase();

    await makeAPICall("POST", "/api/public/traces", {
      name: "trace-name",
      userId: "user-1",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
    });

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.name).toBe("trace-name");
    expect(dbTrace[0]?.release).toBe("1.0.0");
    expect(dbTrace[0]?.externalId).toBeNull();
    expect(dbTrace[0]?.version).toBe("2.0.0");
    expect(dbTrace[0]?.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
  });

  it("should upsert second trace", async () => {
    await pruneDatabase();

    await makeAPICall("POST", "/api/public/traces", {
      id: "trace-id",
      name: "trace-name",
      userId: "user-1",
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
      public: true,
    });

    const dbTrace1 = await prisma.trace.findFirst({
      where: {
        id: "trace-id",
      },
    });

    expect(dbTrace1).not.toBeNull();
    expect(dbTrace1).toMatchObject({
      name: "trace-name",
      release: "1.0.0",
      externalId: null,
      version: "2.0.0",
      public: true,
      userId: "user-1",
    });

    await makeAPICall("POST", "/api/public/traces", {
      id: "trace-id",
      metadata: { key: "value" },
      release: "1.0.0",
      version: "5.0.0",
      public: false,
    });

    const dbTrace2 = await prisma.trace.findFirst({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace2).not.toBeNull();
    expect(dbTrace2).toMatchObject({
      name: "trace-name",
      release: "1.0.0",
      externalId: null,
      version: "5.0.0",
      public: false,
      userId: "user-1",
    });
  });

  it("should use tags correctly on POST and GET", async () => {
    await pruneDatabase();

    await makeAPICall("POST", "/api/public/traces", {
      id: "trace-1",
      tags: ["tag-1", "tag-2", "tag-3"],
    });

    await makeAPICall("POST", "/api/public/traces", {
      id: "trace-2",
      tags: ["tag-1"],
    });

    await makeAPICall("POST", "/api/public/traces", {
      id: "trace-3",
      tags: ["tag-2", "tag-3"],
    });

    // multiple tags
    const traces = await makeAPICall(
      "GET",
      "/api/public/traces?tags=tag-2&tags=tag-3",
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const traceIds = traces.body.data.map((t: { id: string }) => t.id);
    // check for equality ok as ordered by timestamp
    expect(traceIds).toEqual(["trace-3", "trace-1"]);

    // single tag
    const traces2 = await makeAPICall("GET", "/api/public/traces?tags=tag-1");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const traceIds2 = traces2.body.data.map((t: { id: string }) => t.id);
    // check for equality ok as ordered by timestamp
    expect(traceIds2).toEqual(["trace-2", "trace-1"]);

    // wrong tag
    const traces3 = await makeAPICall("GET", "/api/public/traces?tags=tag-10");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const traceIds3 = traces3.body.data.map((t: { id: string }) => t.id);
    // check for equality ok as ordered by timestamp
    expect(traceIds3).toEqual([]);

    // no tag
    const traces4 = await makeAPICall("GET", "/api/public/traces?tags=");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const traceIds4 = traces4.body.data.map((t: { id: string }) => t.id);
    // check for equality ok as ordered by timestamp
    expect(traceIds4).toEqual(["trace-3", "trace-2", "trace-1"]);
  });
});
