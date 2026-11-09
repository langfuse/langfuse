import { describe, expect, it } from "vitest";
import { eventsTableCols } from "../../eventsTable";
import type { EventsTableFilterState } from "../../types";
import { eventsTableNativeUiColumnDefinitions } from "../tableMappings/mapEventsTable";
import {
  createPublicApiObservationsColumnMapping,
  deriveFilters,
} from "./public-api-filter-builder";

const eventsSimpleMapping = createPublicApiObservationsColumnMapping(
  "events_proto",
  "e",
  "parent_span_id",
);

const stringEq = (column: string) =>
  ({ column, type: "string", operator: "=", value: "advanced" }) as const;
const optionsAnyOf = (column: string) =>
  ({
    column,
    type: "stringOptions",
    operator: "any of",
    value: ["advanced"],
  }) as const;

describe("deriveFilters on the events observations path", () => {
  it.each<[string, unknown, EventsTableFilterState[number]]>([
    ["userId", "simple", stringEq("userId")],
    ["sessionId", "simple", stringEq("sessionId")],
    ["traceId", "simple", stringEq("traceId")],
    ["name", "simple", optionsAnyOf("name")],
    ["level", "simple", optionsAnyOf("level")],
    ["type", "simple", optionsAnyOf("type")],
    ["parentObservationId", "simple", stringEq("parentObservationId")],
    [
      "isRootObservation",
      false,
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ],
    [
      "fromStartTime",
      "2026-01-01T00:00:00Z",
      {
        column: "startTime",
        type: "datetime",
        operator: ">=",
        value: new Date("2026-02-01T00:00:00Z"),
      },
    ],
    [
      "toStartTime",
      "2026-03-01T00:00:00Z",
      {
        column: "startTime",
        type: "datetime",
        operator: "<",
        value: new Date("2026-02-01T00:00:00Z"),
      },
    ],
    ["version", "simple", stringEq("version")],
    ["environment", "simple", optionsAnyOf("environment")],
  ])(
    "an advanced filter overrides the %s query param on the same column",
    (param, simpleValue, advanced) => {
      const filters = deriveFilters(
        { page: 1, limit: 10, projectId: "p", [param]: simpleValue },
        eventsSimpleMapping,
        [advanced],
        eventsTableNativeUiColumnDefinitions,
        eventsTableCols,
      );

      expect(filters.length()).toBe(1);
    },
  );
});
