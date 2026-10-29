import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type { Span } from "@opentelemetry/api";
import type { Session } from "next-auth";
import * as z from "zod";

vi.mock("@/src/features/posthog-analytics/server/backendActivity", () => ({
  recordBackendActivity: vi.fn().mockResolvedValue(undefined),
}));

import {
  createInnerTRPCContext,
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

const router = createTRPCRouter({
  project: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(() => ({ ok: true })),
});

const session = {
  expires: "1",
  user: {
    id: "user-1",
    email: "user@example.com",
    name: "Example User",
    admin: false,
    canCreateOrganizations: true,
    featureFlags: testFeatureFlags({ templateFlag: false }),
    organizations: [
      {
        id: "org-1",
        name: "Example Organization",
        role: "MEMBER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        projects: [
          {
            id: "project-1",
            name: "Example Project",
            role: "MEMBER",
            retentionDays: 30,
            deletedAt: null,
          },
        ],
      },
    ],
  },
  environment: {},
} as Session;

const createRequestSpan = () =>
  ({ setAttribute: vi.fn() }) as unknown as Span & {
    setAttribute: ReturnType<typeof vi.fn>;
  };

describe("request span project tagging", () => {
  it("tags the request span with the authorized project and org", async () => {
    const requestSpan = createRequestSpan();
    const caller = router.createCaller(
      createInnerTRPCContext({ session, headers: {}, requestSpan }),
    );

    await expect(caller.project({ projectId: "project-1" })).resolves.toEqual({
      ok: true,
    });

    expect(requestSpan.setAttribute).toHaveBeenCalledWith(
      "langfuse.project.id",
      "project-1",
    );
    expect(requestSpan.setAttribute).toHaveBeenCalledWith(
      "langfuse.org.id",
      "org-1",
    );
  });

  it("does not tag a project the user is not a member of", async () => {
    const requestSpan = createRequestSpan();
    const caller = router.createCaller(
      createInnerTRPCContext({ session, headers: {}, requestSpan }),
    );

    await expect(
      caller.project({ projectId: "project-other" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(requestSpan.setAttribute).not.toHaveBeenCalled();
  });
});
