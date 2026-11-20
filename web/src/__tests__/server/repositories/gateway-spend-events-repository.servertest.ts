import { vi } from "vitest";

// The events tables exist only where the v4 preview opt-in creates them.
const eventsTableAvailable = vi.hoisted(
  () => process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true",
);

import { AI_GATEWAY_SERVICE_NAME } from "@langfuse/shared";
import {
  createEvent,
  createEventsCh,
  getGatewaySpendSinceFromEvents,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import waitForExpect from "wait-for-expect";

const maybe = eventsTableAvailable ? describe : describe.skip;

describe("gateway spend events repository liveness", () => {
  it("does not hang when the events table is unavailable", () => {});
});

maybe("getGatewaySpendSinceFromEvents", () => {
  it("sums each key's gateway spend from its own start", async () => {
    const projectId = randomUUID();
    const gatewayEvent = (apiKeyId: string, startTime: string, cost: number) =>
      createEvent({
        project_id: projectId,
        service_name: AI_GATEWAY_SERVICE_NAME,
        ingestion_api_key: apiKeyId,
        start_time: new Date(startTime),
        cost_details: { total: cost },
      });
    await createEventsCh([
      gatewayEvent("daily", "2026-11-16T23:00:00Z", 100),
      gatewayEvent("daily", "2026-11-17T01:00:00Z", 1.5),
      gatewayEvent("daily", "2026-11-17T02:00:00Z", 2),
      gatewayEvent("monthly", "2026-11-02T00:00:00Z", 3),
      gatewayEvent("other", "2026-11-17T02:00:00Z", 50),
      createEvent({
        project_id: projectId,
        ingestion_api_key: "monthly",
        start_time: new Date("2026-11-17T02:00:00Z"),
        cost_details: { total: 40 },
      }),
    ]);

    await waitForExpect(async () => {
      const spend = await getGatewaySpendSinceFromEvents({
        projectId,
        scope: "API_KEY",
        subjects: [
          { id: "daily", since: new Date("2026-11-17T00:00:00Z") },
          { id: "monthly", since: new Date("2026-11-01T00:00:00Z") },
          { id: "unused", since: new Date("2026-11-01T00:00:00Z") },
        ],
      });
      expect(spend.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual([
        { id: "daily", spendUsd: 3.5 },
        { id: "monthly", spendUsd: 3 },
      ]);
      // The organization is its ingestion project: every key's gateway spend, not other events.
      expect(
        await getGatewaySpendSinceFromEvents({
          projectId,
          scope: "ORGANIZATION",
          subjects: [
            { id: projectId, since: new Date("2026-11-17T00:00:00Z") },
          ],
        }),
      ).toEqual([{ id: projectId, spendUsd: 53.5 }]);
    });
  });
});
