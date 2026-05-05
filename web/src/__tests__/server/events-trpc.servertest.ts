import type { Session } from "next-auth";
import superjson from "superjson";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import type * as EventsService from "@/src/features/events/server/eventsService";
import { getEventBatchIO } from "@/src/features/events/server/eventsService";
import type * as SharedServer from "@langfuse/shared/src/server";
import { getObservationsForTraceFromEventsTable } from "@langfuse/shared/src/server";

vi.mock(
  "@/src/features/events/server/eventsService",
  async (importOriginal) => {
    const actual = await importOriginal<typeof EventsService>();

    return {
      ...actual,
      getEventBatchIO: vi.fn(),
    };
  },
);

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();

  return {
    ...actual,
    getObservationsForTraceFromEventsTable: vi.fn(),
  };
});

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

      vi.mocked(getEventBatchIO).mockResolvedValueOnce([
        {
          id: observationId,
          input: { prototype: "input", safeKey: "input-value" },
          output: { prototype: "output", safeKey: "output-value" },
          metadata: {
            prototype: "metadata",
            safeKey: "metadata-value",
          },
        },
      ]);

      const result = await caller.events.batchIO({
        projectId,
        observations: [{ id: observationId, traceId }],
        minStartTime: new Date(startTime.getTime() - 1000),
        maxStartTime: new Date(startTime.getTime() + 1000),
        truncated: false,
      });

      expect(result).toHaveLength(1);
      expect(typeof result[0]?.input).toBe("string");
      expect(JSON.parse(result[0]?.input ?? "{}")).toEqual({
        prototype: "input",
        safeKey: "input-value",
      });
      expect(typeof result[0]?.output).toBe("string");
      expect(JSON.parse(result[0]?.output ?? "{}")).toEqual({
        prototype: "output",
        safeKey: "output-value",
      });
      expect(typeof result[0]?.metadata).toBe("string");
      expect(JSON.parse(result[0]?.metadata ?? "{}")).toEqual({
        prototype: "metadata",
        safeKey: "metadata-value",
      });
      expect(() => superjson.serialize(result)).not.toThrow();
    });
  });

  describe("events.byTraceId", () => {
    it("returns observation metadata with protected superjson keys as a string", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const startTime = new Date();

      vi.mocked(getObservationsForTraceFromEventsTable).mockResolvedValueOnce({
        observations: [
          createEventObservation({
            id: observationId,
            traceId,
            startTime,
            metadata: {
              prototype: "metadata",
              safeKey: "metadata-value",
            },
          }),
        ],
        totalCount: 1,
      });

      const result = await caller.events.byTraceId({
        projectId,
        traceId,
      });

      expect(result.observations).toHaveLength(1);
      expect(typeof result.observations[0]?.metadata).toBe("string");
      expect(JSON.parse(result.observations[0]?.metadata ?? "{}")).toEqual({
        prototype: "metadata",
        safeKey: "metadata-value",
      });
      expect(result.cutoffObservationsAfterMaxCount).toBe(false);
      expect(() => superjson.serialize(result)).not.toThrow();
    });
  });
});

type EventObservation = Awaited<
  ReturnType<typeof getObservationsForTraceFromEventsTable>
>["observations"][number];

const createEventObservation = (
  overrides: Partial<EventObservation> = {},
): EventObservation => {
  const now = new Date();

  return {
    id: randomUUID(),
    traceId: randomUUID(),
    projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    environment: "default",
    type: "SPAN",
    startTime: now,
    endTime: null,
    name: "Observation",
    metadata: {},
    parentObservationId: null,
    level: "DEFAULT",
    statusMessage: null,
    version: null,
    createdAt: now,
    updatedAt: now,
    model: null,
    internalModelId: null,
    modelParameters: null,
    input: null,
    output: null,
    completionStartTime: null,
    promptId: null,
    promptName: null,
    promptVersion: null,
    latency: null,
    timeToFirstToken: null,
    usageDetails: {},
    costDetails: {},
    providedCostDetails: {},
    inputCost: null,
    outputCost: null,
    totalCost: null,
    inputUsage: 0,
    outputUsage: 0,
    totalUsage: 0,
    usagePricingTierId: null,
    usagePricingTierName: null,
    toolDefinitions: null,
    toolCalls: null,
    toolCallNames: null,
    userId: null,
    sessionId: null,
    traceName: "Trace",
    release: null,
    tags: [],
    bookmarked: false,
    public: false,
    traceTags: [],
    traceTimestamp: now,
    toolDefinitionsCount: null,
    toolCallsCount: null,
    inputPrice: null,
    outputPrice: null,
    totalPrice: null,
    ...overrides,
  };
};
