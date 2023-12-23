/** @jest-environment node */
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@/src/server/db";
import type { Session } from "next-auth";

describe("Alerts TRPC Router", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  const session: Session = {
    expires: "1",
    user: {
      id: "clgb17vnp000008jjere5g15i",
      name: "John Doe",
      projects: [
        {
          id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          role: "ADMIN",
          name: "test",
        },
      ],
      featureFlags: {
        templateFlag: true,
        costAlerts: true,
      },
      admin: true,
    },
  };

  const ctx = createInnerTRPCContext({ session });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  test("alerts.all RPC returns an array of alerts", async () => {
    // await prisma.trace.create({
    //   data: { ...trace, projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
    // });

    const traces = await caller.alerts.all({
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    });
    expect(traces).toBeDefined();
    expect(traces).toHaveLength(1);
  });
});
