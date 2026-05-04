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
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
              metadata: {},
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

    it("should match observation numeric score filters when any raw score value matches", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();
      const uniqueTraceName = `raw-score-trace-${randomUUID()}`;
      const scoreName = `quality-${randomUUID()}`;

      await createTracesCh([
        createTrace({
          id: traceId,
          project_id: projectId,
          name: uniqueTraceName,
        }),
      ]);

      await createObservationsCh([
        createObservation({
          id: generationId,
          project_id: projectId,
          trace_id: traceId,
          type: "GENERATION",
          name: "raw-score-generation",
        }),
      ]);

      await createScoresCh([
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: generationId,
          name: scoreName,
          source: "API",
          data_type: "NUMERIC",
          value: 0.9,
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: generationId,
          name: scoreName,
          source: "API",
          data_type: "NUMERIC",
          value: 0.1,
        }),
      ]);

      const generations = await caller.generations.all({
        projectId,
        searchQuery: "",
        searchType: [],
        filter: [
          {
            column: "Trace Name",
            operator: "=",
            value: uniqueTraceName,
            type: "string",
          },
          {
            column: "scores_avg",
            operator: "=",
            key: scoreName,
            value: 0.9,
            type: "numberObject",
          },
        ],
        orderBy: null,
        limit: 50,
        page: 0,
      });

      expect(generations.generations).toHaveLength(1);
      expect(generations.generations[0]?.id).toBe(generationId);
    });
  });

  describe("generations.filterOptions", () => {
    it("should include observation-scoped numeric score filter options only", async () => {
      const trace = createTrace({
        project_id: projectId,
      });
      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
        type: "GENERATION",
      });

      await createTracesCh([trace]);
      await createObservationsCh([observation]);

      const observationScore = createTraceScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observation.id,
        name: `observation_only_quality_${randomUUID()}`,
        source: "API",
        data_type: "NUMERIC",
        value: 0.7,
      });
      const traceScore = createTraceScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: null,
        name: `trace_only_quality_${randomUUID()}`,
        source: "API",
        data_type: "NUMERIC",
        value: 0.9,
      });
      const sessionScore = createTraceScore({
        project_id: projectId,
        trace_id: null,
        session_id: randomUUID(),
        name: `session_only_quality_${randomUUID()}`,
        source: "API",
        data_type: "NUMERIC",
        value: 0.5,
      });

      await createScoresCh([observationScore, traceScore, sessionScore]);

      const filterOptions = await caller.generations.filterOptions({
        projectId,
      });

      expect(filterOptions.scores_avg).toContain(observationScore.name);
      expect(filterOptions.scores_avg).not.toContain(traceScore.name);
      expect(filterOptions.scores_avg).not.toContain(sessionScore.name);
    });
  });
});
