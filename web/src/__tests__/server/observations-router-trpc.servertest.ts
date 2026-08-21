import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createTrace,
  createTracesCh,
  createObservation,
  createObservationsCh,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

// Note: `observations-trpc.servertest.ts` already exists and covers the
// `generations` router (a legacy alias), not the `observations` router
// tested here — kept as a separate file to avoid colliding names.
describe("observations router trpc", () => {
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
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
              hasTraces: true,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
        searchBar: false,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
      admin: true,
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  describe("observations.byIds", () => {
    // Regression coverage for the dataset run comparison grid, which
    // previously fired one `observations.byId` request per cell (one HTTP
    // request per grid cell). `byIds` must resolve every requested
    // observation from a single batched call.
    it("returns an empty array for an empty id list", async () => {
      const result = await caller.observations.byIds({
        projectId,
        observationIds: [],
      });

      expect(result).toEqual([]);
    });

    it("batches multiple observations into a single response", async () => {
      const trace = createTrace({ project_id: projectId });
      const observations = [
        createObservation({ project_id: projectId, trace_id: trace.id }),
        createObservation({ project_id: projectId, trace_id: trace.id }),
        createObservation({ project_id: projectId, trace_id: trace.id }),
      ];

      await createTracesCh([trace]);
      await createObservationsCh(observations);

      const result = await caller.observations.byIds({
        projectId,
        observationIds: observations.map((o) => o.id),
      });

      expect(result.map((o) => o.id).sort()).toEqual(
        observations.map((o) => o.id).sort(),
      );
      const first = result.find((o) => o.id === observations[0]!.id);
      expect(first?.projectId).toEqual(projectId);
      expect(first?.output).toEqual(observations[0]!.output);
    });

    it("omits ids that do not resolve to an observation in the project", async () => {
      const trace = createTrace({ project_id: projectId });
      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
      });

      await createTracesCh([trace]);
      await createObservationsCh([observation]);

      const result = await caller.observations.byIds({
        projectId,
        observationIds: [observation.id, randomUUID()],
      });

      expect(result.map((o) => o.id)).toEqual([observation.id]);
    });
  });
});
