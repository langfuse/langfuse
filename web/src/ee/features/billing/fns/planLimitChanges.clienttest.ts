import { describe, expect, it } from "vitest";

import { planLimitChanges } from "./planLimitChanges";

describe("planLimitChanges", () => {
  it("lists all six limits, raised ones marked up", () => {
    expect(planLimitChanges("cloud:hobby", "cloud:pro")).toEqual([
      {
        kind: "units",
        label: "Units a month",
        was: "50k",
        now: "100k",
        direction: "up",
      },
      {
        kind: "data-access",
        label: "Data access",
        was: "30 days",
        now: "3 years",
        direction: "up",
      },
      {
        kind: "users",
        label: "Users",
        was: "2",
        now: "Unlimited",
        direction: "up",
      },
      {
        kind: "annotation-queues",
        label: "Annotation queues",
        was: "1",
        now: "Unlimited",
        direction: "up",
      },
      { kind: "alerts", label: "Alerts", was: "2", now: "50", direction: "up" },
      {
        kind: "ingestion",
        label: "Ingestion",
        was: "1,000 / min",
        now: "20,000 / min",
        direction: "up",
      },
    ]);
  });

  it("marks the limits a downgrade lowers and leaves the rest the same", () => {
    const changes = planLimitChanges("cloud:enterprise", "cloud:core");
    expect(
      changes.map((limit) => [
        limit.kind,
        limit.was,
        limit.now,
        limit.direction,
      ]),
    ).toEqual([
      ["units", "100k", "100k", "same"],
      ["data-access", "3 years", "90 days", "down"],
      ["users", "Unlimited", "Unlimited", "same"],
      ["annotation-queues", "Unlimited", "3", "down"],
      ["alerts", "100", "20", "down"],
      ["ingestion", "Custom", "4,000 / min", "down"],
    ]);
  });

  it("changes no limit between Pro and the Teams add-on", () => {
    expect(
      planLimitChanges("cloud:pro", "cloud:team").map(
        (limit) => limit.direction,
      ),
    ).toEqual(["same", "same", "same", "same", "same", "same"]);
  });
});
