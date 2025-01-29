/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import { PostTracesV1Response } from "@/src/features/public-api/types/traces";
import { prisma } from "@langfuse/shared/src/db";

describe("Create and get sessions", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should create a session via a trace", async () => {
    await pruneDatabase();

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        sessionId: "session-id",
      },
    );

    // Delay to allow for async processing
    await new Promise((resolve) => setTimeout(resolve, 500));

    const dbSession = await prisma.traceSession.findFirst({
      where: {
        id: "session-id",
      },
    });

    expect(dbSession).not.toBeNull();
    expect(dbSession).toMatchObject({
      id: "session-id",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    });
  });
});
