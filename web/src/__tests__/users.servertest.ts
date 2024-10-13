import {
  makeZodVerifiedAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import {
  GetUsersResponse,
} from "@/src/features/public-api/types/users";

import {
  PostTracesV1Response
} from "@/src/features/public-api/types/traces";

describe("/api/public/users API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should get 0 userIDs from /api/public/users", async () => {
    await pruneDatabase();
    
    const users = await makeZodVerifiedAPICall(
      GetUsersResponse,
      "GET",
      "/api/public/users/"
    );

    expect(users.body.users.length).toBe(0);
  });

  it("should create 2 traces and get the userIDs in order from /api/public/users", async () => {
    await pruneDatabase();

    const traceCreate1 = await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        userId: "user-1",
        timestamp: "2021-01-01T00:00:00.000Z",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
    );

    const traceCreate2 = await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        userId: "user-2",
        timestamp: "2021-01-02T00:00:00.000Z",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
    );

    const users = await makeZodVerifiedAPICall(
      GetUsersResponse,
      "GET",
      "/api/public/users/"
    );

    expect(users.body.users[1].userId).toBe("user-1");
    expect(users.body.users[1].lastTrace).toBe("2021-01-01T00:00:00.000Z");
    expect(users.body.users[0].userId).toBe("user-2");
    expect(users.body.users[0].lastTrace).toBe("2021-01-02T00:00:00.000Z");
  });

  it("should create 3 traces and get the relevant userIDs on each page from /api/public/users", async () => {
    await pruneDatabase();

    const traceCreate1 = await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        userId: "user-1",
        timestamp: "2022-01-01T00:00:00.000Z",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
    );

    const traceCreate2 = await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        userId: "user-2",
        timestamp: "2022-01-02T00:00:00.000Z",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
    );

    const traceCreate3 = await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        userId: "user-3",
        timestamp: "2021-01-02T00:00:00.000Z",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
    );

    const users1 = await makeZodVerifiedAPICall(
      GetUsersResponse,
      "GET",
      "/api/public/users?page=1&limit=2",
    );
    
    expect(users1.body.users.length).toBe(2);
    expect(users1.body.users[1].userId).toBe("user-1");
    expect(users1.body.users[0].userId).toBe("user-2");

    const users2 = await makeZodVerifiedAPICall(
      GetUsersResponse,
      "GET",
      "/api/public/users?page=2&limit=2",
    );

    expect(users2.body.users.length).toBe(1);
    expect(users2.body.users[0].userId).toBe("user-3");
  });
});