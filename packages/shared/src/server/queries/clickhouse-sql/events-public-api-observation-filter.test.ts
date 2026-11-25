import { describe, expect, it } from "vitest";
import type { EventsTableFilterState } from "../../../types";
import {
  compilePublicApiObservationsFilter,
  type PublicApiObservationsFilterParams,
} from "./events-public-api-observation-filter";

type AdvancedFilter = EventsTableFilterState[number];

const stringEq = (column: string): AdvancedFilter => ({
  column,
  type: "string",
  operator: "=",
  value: "advanced",
});
const optionsAnyOf = (column: string): AdvancedFilter => ({
  column,
  type: "stringOptions",
  operator: "any of",
  value: ["advanced"],
});

describe("compilePublicApiObservationsFilter precedence", () => {
  // Each simple value is bound only if the advanced filter fails to replace it.
  it.each<
    [keyof PublicApiObservationsFilterParams, unknown, unknown, AdvancedFilter]
  >([
    ["userId", "simple", "simple", stringEq("userId")],
    ["sessionId", "simple", "simple", stringEq("sessionId")],
    ["traceId", "simple", "simple", stringEq("traceId")],
    ["name", "simple", "simple", optionsAnyOf("name")],
    ["level", "simple", "simple", optionsAnyOf("level")],
    ["type", "simple", "simple", optionsAnyOf("type")],
    [
      "parentObservationId",
      "simple",
      "simple",
      stringEq("parentObservationId"),
    ],
    [
      "isRootObservation",
      false,
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
      "2026-01-01 00:00:00.000",
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
      "2026-03-01 00:00:00.000",
      {
        column: "Start Time",
        type: "datetime",
        operator: "<",
        value: new Date("2026-02-01T00:00:00Z"),
      },
    ],
    ["version", "simple", "simple", stringEq("version")],
    ["environment", "simple", ["simple"], optionsAnyOf("Trace Environment")],
  ])(
    "an advanced filter on the same field replaces the %s query param",
    (param, simpleValue, simpleBind, advanced) => {
      const { events } = compilePublicApiObservationsFilter({
        projectId: "p",
        params: { [param]: simpleValue },
        advancedFilters: [advanced],
      });

      expect(Object.values(events?.params ?? {})).not.toContainEqual(
        simpleBind,
      );
    },
  );
});

describe("compilePublicApiObservationsFilter simple params and IO checks", () => {
  it("splits a comma-separated environment param into its values", () => {
    const { events } = compilePublicApiObservationsFilter({
      projectId: "p",
      params: { environment: "production,staging" },
    });

    expect(Object.values(events?.params ?? {})).toContainEqual([
      "production",
      "staging",
    ]);
  });

  // v1 list and count accept every input/output filter type.
  it("skips the input/output type check when unindexed IO filters are allowed", () => {
    const { events } = compilePublicApiObservationsFilter({
      projectId: "p",
      params: {},
      advancedFilters: [
        { column: "input", type: "null", operator: "is not null", value: "" },
      ],
      allowUnindexedIoFilters: true,
    });

    expect(events?.sql).toContain("e.input");
  });
});
