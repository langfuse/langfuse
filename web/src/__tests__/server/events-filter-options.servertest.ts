import {
  createEvent,
  createEventsCh,
  createScoresCh,
  createTraceScore,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";
import { getEventFilterOptions } from "@/src/features/events/server/eventsService";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
    ? describe
    : describe.skip;

describe("events filter options", () => {
  maybe("getEventFilterOptions", () => {
    it("should scope numeric score filter options to the current root-observation view", async () => {
      const rootTraceId = randomUUID();
      const childTraceId = randomUUID();
      const rootObservationId = randomUUID();
      const childObservationId = randomUUID();

      await createEventsCh([
        createEvent({
          id: rootObservationId,
          span_id: rootObservationId,
          project_id: projectId,
          trace_id: rootTraceId,
          type: "GENERATION",
          name: `root-event-${randomUUID()}`,
          parent_span_id: "",
        }),
        createEvent({
          id: childObservationId,
          span_id: childObservationId,
          project_id: projectId,
          trace_id: childTraceId,
          type: "GENERATION",
          name: `child-event-${randomUUID()}`,
          parent_span_id: randomUUID(),
        }),
      ]);

      const rootObservationScore = createTraceScore({
        project_id: projectId,
        trace_id: rootTraceId,
        observation_id: rootObservationId,
        name: `root_observation_score_${randomUUID()}`,
        source: "API",
        data_type: "NUMERIC",
        value: 0.8,
      });
      const childObservationScore = createTraceScore({
        project_id: projectId,
        trace_id: childTraceId,
        observation_id: childObservationId,
        name: `child_observation_score_${randomUUID()}`,
        source: "API",
        data_type: "NUMERIC",
        value: 0.4,
      });
      const rootTraceScore = createTraceScore({
        project_id: projectId,
        trace_id: rootTraceId,
        observation_id: null,
        name: `root_trace_score_${randomUUID()}`,
        source: "API",
        data_type: "NUMERIC",
        value: 0.9,
      });
      const childTraceScore = createTraceScore({
        project_id: projectId,
        trace_id: childTraceId,
        observation_id: null,
        name: `child_trace_score_${randomUUID()}`,
        source: "API",
        data_type: "NUMERIC",
        value: 0.2,
      });

      await createScoresCh([
        rootObservationScore,
        childObservationScore,
        rootTraceScore,
        childTraceScore,
      ]);

      const filterOptions = await getEventFilterOptions({
        projectId,
        hasParentObservation: false,
      });

      expect(filterOptions.scores_avg).toContain(rootObservationScore.name);
      expect(filterOptions.scores_avg).not.toContain(
        childObservationScore.name,
      );
      expect(filterOptions.trace_scores_avg).toContain(rootTraceScore.name);
      expect(filterOptions.trace_scores_avg).not.toContain(
        childTraceScore.name,
      );
    });
  });
});
