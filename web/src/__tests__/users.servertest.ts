import { prisma } from "@langfuse/shared/src/db";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import {
  GetUsersQuery,
  GetUsersResponse,
} from "@/src/features/public-api/types/users";

import {
  PostTracesV1Response
} from "@/src/features/public-api/types/traces";
import { assert } from "console";

describe("/api/public/users API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should create a trace and get the userID from /api/public/users", async () => {
    await pruneDatabase();

    const traceCreate = await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        userId: "user-1",
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

    expect(users.body.users[0].userId).toBe("user-1");
  });
});