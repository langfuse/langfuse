import { vi } from "vitest";

// The events tables exist only where the v4 preview opt-in creates them.
const eventsTableAvailable = vi.hoisted(
  () => process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true",
);

import {
  AI_GATEWAY_GUARDRAIL_METADATA_PREFIX,
  AI_GATEWAY_GUARDRAILS_OUTCOME_METADATA_KEY,
  AI_GATEWAY_SERVICE_NAME,
} from "@langfuse/shared";
import {
  createEvent,
  createEventsCh,
  getGatewayGuardrailFlaggedCountsFromEvents,
  getGatewayGuardrailFlaggedTimeSeriesFromEvents,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import waitForExpect from "wait-for-expect";

const maybe = eventsTableAvailable ? describe : describe.skip;

describe("gateway guardrail events repository short-circuits", () => {
  it("returns empty results without querying ClickHouse when guardrailIds is empty", async () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(
      await getGatewayGuardrailFlaggedCountsFromEvents({
        projectId: "unused",
        guardrailIds: [],
        since: now,
      }),
    ).toEqual([]);
    expect(
      await getGatewayGuardrailFlaggedTimeSeriesFromEvents({
        projectId: "unused",
        fromTimestamp: now,
        toTimestamp: now,
        granularity: "day",
        guardrailIds: [],
      }),
    ).toEqual([]);
  });
});

maybe("gateway guardrail events queries", () => {
  it("counts per-guardrail matches and bucketed WITH FILL time series from events_core", async () => {
    const projectId = randomUUID();
    const flaggedEvent = (
      startTime: string,
      guardrails: Array<{ id: string; action: "block" | "log" }>,
    ) => {
      const outcome = guardrails.some((g) => g.action === "block")
        ? "block"
        : "log";
      const metadata: Record<string, string> = {
        [AI_GATEWAY_GUARDRAILS_OUTCOME_METADATA_KEY]: outcome,
      };
      for (const guardrail of guardrails) {
        metadata[`${AI_GATEWAY_GUARDRAIL_METADATA_PREFIX}${guardrail.id}`] =
          guardrail.action;
      }
      return createEvent({
        project_id: projectId,
        service_name: AI_GATEWAY_SERVICE_NAME,
        start_time: new Date(startTime),
        metadata_names: Object.keys(metadata),
        metadata_values: Object.values(metadata),
      });
    };

    await createEventsCh([
      // Before window
      flaggedEvent("2026-11-01T12:00:00Z", [{ id: "g1", action: "block" }]),
      // Day 1: request matches both g1 and g2
      flaggedEvent("2026-11-10T08:00:00Z", [
        { id: "g1", action: "block" },
        { id: "g2", action: "log" },
      ]),
      // Day 1: second request matches g1
      flaggedEvent("2026-11-10T09:00:00Z", [{ id: "g1", action: "block" }]),
      // Day 3 (day 2 intentionally empty to exercise WITH FILL): matches g2
      flaggedEvent("2026-11-12T10:00:00Z", [{ id: "g2", action: "log" }]),
      // Non-gateway span with spoofed metadata must be ignored
      createEvent({
        project_id: projectId,
        service_name: "other-service",
        start_time: new Date("2026-11-10T10:00:00Z"),
        metadata_names: [
          AI_GATEWAY_GUARDRAILS_OUTCOME_METADATA_KEY,
          `${AI_GATEWAY_GUARDRAIL_METADATA_PREFIX}g1`,
        ],
        metadata_values: ["block", "block"],
      }),
    ]);

    await waitForExpect(async () => {
      const counts = await getGatewayGuardrailFlaggedCountsFromEvents({
        projectId,
        guardrailIds: ["g1", "g2", "g3"],
        since: new Date("2026-11-09T00:00:00Z"),
      });
      expect(
        counts.toSorted((a, b) => a.guardrailId.localeCompare(b.guardrailId)),
      ).toEqual([
        { guardrailId: "g1", count: 2 },
        { guardrailId: "g2", count: 2 },
      ]);

      // Unfiltered total counts each flagged request once (2 on Nov 10, 0 on Nov 11 via WITH FILL, 1 on Nov 12)
      const totalSeries = await getGatewayGuardrailFlaggedTimeSeriesFromEvents({
        projectId,
        fromTimestamp: new Date("2026-11-10T00:00:00Z"),
        toTimestamp: new Date("2026-11-12T23:59:59Z"),
        granularity: "day",
      });
      expect(totalSeries).toEqual([
        { timeDimension: "2026-11-10", count: 2 },
        { timeDimension: "2026-11-11", count: 0 },
        { timeDimension: "2026-11-12", count: 1 },
      ]);

      // Grouped breakdown returns one series per guardrail plus WITH FILL empty-bucket marker on Nov 11
      const breakdownSeries =
        await getGatewayGuardrailFlaggedTimeSeriesFromEvents({
          projectId,
          fromTimestamp: new Date("2026-11-10T00:00:00Z"),
          toTimestamp: new Date("2026-11-12T23:59:59Z"),
          granularity: "day",
          guardrailIds: ["g1", "g2"],
          groupByGuardrail: true,
        });
      expect(
        breakdownSeries.toSorted(
          (a, b) =>
            a.timeDimension.localeCompare(b.timeDimension) ||
            (a.guardrailId ?? "").localeCompare(b.guardrailId ?? ""),
        ),
      ).toEqual([
        { timeDimension: "2026-11-10", guardrailId: "g1", count: 2 },
        { timeDimension: "2026-11-10", guardrailId: "g2", count: 1 },
        { timeDimension: "2026-11-11", guardrailId: undefined, count: 0 },
        { timeDimension: "2026-11-12", guardrailId: "g2", count: 1 },
      ]);
    });
  });
});
