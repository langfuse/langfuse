import type { Session } from "next-auth";
import superjson from "superjson";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createEvent, createEventsCh } from "@langfuse/shared/src/server";

describe("events trpc", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: "seed-org-id",
          name: "Test Organization",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  describe("events.batchIO", () => {
    it("returns metadata with protected superjson keys as a string", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const startTime = new Date();

      await createEventsCh([
        createEvent({
          id: observationId,
          span_id: observationId,
          trace_id: traceId,
          project_id: projectId,
          start_time: startTime.getTime() * 1000,
          end_time: startTime.getTime() * 1000,
          metadata_names: ["prototype", "safeKey"],
          metadata_values: ["test", "safe-value"],
        }),
      ]);

      const result = await caller.events.batchIO({
        projectId,
        observations: [{ id: observationId, traceId }],
        minStartTime: new Date(startTime.getTime() - 1000),
        maxStartTime: new Date(startTime.getTime() + 1000),
        truncated: false,
      });

      expect(result).toHaveLength(1);
      expect(typeof result[0]?.metadata).toBe("string");
      expect(JSON.parse(result[0]?.metadata ?? "{}")).toEqual({
        prototype: "test",
        safeKey: "safe-value",
      });
      expect(() => superjson.serialize(result)).not.toThrow();
    });
  });
});
