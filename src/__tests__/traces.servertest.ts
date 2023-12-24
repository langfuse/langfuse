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
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
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
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
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
});
