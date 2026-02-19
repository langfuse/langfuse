/** @jest-environment node */

import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { PostTracesV1Response } from "@/src/features/public-api/types/traces";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import waitForExpect from "wait-for-expect";

describe("Create and get sessions", () => {
  let auth: string;
  let projectId: string;

  beforeEach(async () => {
    const setup = await createOrgProjectAndApiKey();
    auth = setup.auth;
    projectId = setup.projectId;
  });

  it("should create a session via a trace", async () => {
    const sessionId = "session-id";

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        projectId,
        sessionId,
      },
      auth,
    );

    await waitForExpect(async () => {
      const dbSession = await prisma.traceSession.findFirst({
        where: {
          id: sessionId,
          projectId,
        },
      });

      expect(dbSession).not.toBeNull();
      expect(dbSession).toMatchObject({
        id: sessionId,
        projectId,
      });
    });
  });
});
