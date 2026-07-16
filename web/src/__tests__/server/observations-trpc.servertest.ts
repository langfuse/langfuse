import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createTrace,
  createTracesCh,
  createObservation,
  createObservationsCh,
  createTraceScore,
  createScoresCh,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

describe("traces trpc", () => {
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
          aiTelemetryEnabled: true,
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
              metadata: {},
              hasTraces: true,
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

  describe("generations.all", () => {
    it("should get all generations with full text search and trace + scores filter", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();
      const scoreId = randomUUID();

      // Create trace with searchable content
      const trace = createTrace({
        id: traceId,
        project_id: projectId,
        name: "test-trace-name",
        user_id: "test-user-123",
      });

      await createTracesCh([trace]);

      // Create generation with searchable input/output content
      const generation = createObservation({
        id: generationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-generation",
        input: "Hello world, this is a test input",
        output: "This is a test response output",
      });

      await createObservationsCh([generation]);

      // Create score for the trace
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: traceId,
        name: "quality-score",
        value: 0.85,
      });

      await createScoresCh([score]);

      // Test with full-text search, trace filter, and score filter
      const generations = await caller.generations.all({
        projectId,
        searchQuery: "test input", // Full-text search
        searchType: ["content"], // Search in input/output content
        filter: [
          {
            column: "Trace Name",
            operator: "contains",
            value: "test-trace",
            type: "string",
          },
          {
            column: "Scores (numeric)",
            key: "test",
            operator: ">=",
            value: 5,
            type: "numberObject",
          },
        ],
        orderBy: null,
        limit: 50,
        page: 0,
      });

      expect(generations.generations).toBeDefined();
    });

    it("should filter generations by boolean scores", async () => {
      const traceId = randomUUID();
      const matchingGenerationId = randomUUID();
      const otherGenerationId = randomUUID();
      const scoreName = `passes_guardrail_${randomUUID()}`;

      const trace = createTrace({
        id: traceId,
        project_id: projectId,
        name: "boolean-score-generation-trace",
      });
      const matchingGeneration = createObservation({
        id: matchingGenerationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "boolean-score-generation-match",
      });
      const otherGeneration = createObservation({
        id: otherGenerationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "boolean-score-generation-other",
      });

      await createTracesCh([trace]);
      await createObservationsCh([matchingGeneration, otherGeneration]);
      await createScoresCh([
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: matchingGenerationId,
          name: scoreName,
          value: 1,
          string_value: "True",
          data_type: "BOOLEAN",
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: otherGenerationId,
          name: scoreName,
          value: 0,
          string_value: "False",
          data_type: "BOOLEAN",
        }),
      ]);

      const generations = await caller.generations.all({
        projectId,
        searchQuery: "",
        searchType: [],
        filter: [
          {
            column: "score_booleans",
            key: scoreName,
            operator: "=",
            value: true,
            type: "booleanObject",
          },
        ],
        orderBy: null,
        limit: 50,
        page: 0,
      });

      expect(generations.generations.map((g) => g.id)).toEqual([
        matchingGenerationId,
      ]);
    });

    it("should search generations by input only", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();

      const trace = createTrace({
        id: traceId,
        project_id: projectId,
        name: "input-search-trace",
      });

      await createTracesCh([trace]);

      // Create generation with distinct input and output
      const generation = createObservation({
        id: generationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "input-search-generation",
        input: "unique_input_keyword for search testing",
        output: "different output without the keyword",
      });

      await createObservationsCh([generation]);

      // Search for keyword that only exists in input
      const inputSearchResults = await caller.generations.all({
        projectId,
        searchQuery: "unique_input_keyword",
        searchType: ["input"], // Search only in input
        filter: [],
        orderBy: null,
        limit: 50,
        page: 0,
      });

      expect(inputSearchResults.generations).toBeDefined();
    });

    it("should search generations by output only", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();

      const trace = createTrace({
        id: traceId,
        project_id: projectId,
        name: "output-search-trace",
      });

      await createTracesCh([trace]);

      // Create generation with distinct input and output
      const generation = createObservation({
        id: generationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "output-search-generation",
        input: "simple input without special keywords",
        output: "unique_output_keyword for search testing",
      });

      await createObservationsCh([generation]);

      // Search for keyword that only exists in output
      const outputSearchResults = await caller.generations.all({
        projectId,
        searchQuery: "unique_output_keyword",
        searchType: ["output"], // Search only in output
        filter: [],
        orderBy: null,
        limit: 50,
        page: 0,
      });

      expect(outputSearchResults.generations).toBeDefined();
    });
  });

  describe("generations.countAll", () => {
    it("counts only matching full-text search results", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();
      const searchKeyword = `generation-count-search-${randomUUID()}`;

      await createTracesCh([
        createTrace({
          id: traceId,
          project_id: projectId,
          name: "generation-count-search-trace",
        }),
      ]);

      await createObservationsCh([
        createObservation({
          id: generationId,
          project_id: projectId,
          trace_id: traceId,
          type: "GENERATION",
          name: "generation-count-search-observation",
          input: searchKeyword,
        }),
      ]);

      const count = await caller.generations.countAll({
        projectId,
        searchQuery: searchKeyword,
        searchType: ["content"],
        filter: [],
        orderBy: null,
      });

      expect(count.totalCount).toBe(1);
    });
  });
});
