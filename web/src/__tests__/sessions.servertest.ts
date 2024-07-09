/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import { GetSessionV1Response } from "@/src/features/public-api/types/sessions";
import { PostTracesV1Response } from "@/src/features/public-api/types/traces";
import { prisma } from "@langfuse/shared/src/db";

describe("/api/public/traces API Endpoint", () => {
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
      undefined,
      false,
    );

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

  it("should get session including traces", async () => {
    await pruneDatabase();

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        id: "trace-id",
        input: { hello: "world" },
        output: "hi",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        sessionId: "session-id",
      },
      undefined,
      false,
    );

    const response = await makeZodVerifiedAPICall(
      GetSessionV1Response,
      "GET",
      "/api/public/sessions/session-id",
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: "session-id",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      traces: [
        {
          id: "trace-id",
          input: { hello: "world" },
          output: "hi",
        },
      ],
    });
  });
});
