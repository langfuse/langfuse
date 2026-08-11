import {
  type FilterState,
  eventsTableCols,
  observationsTableCols,
  tracesTableCols,
} from "@langfuse/shared";
import { getViewDeclaration, type views } from "@langfuse/shared/query";
import { type z } from "zod";
import {
  classifyViewFiltersForTable,
  tableTargetForView,
} from "./viewFilterToTableFilter";

type ViewName = z.infer<typeof views>;

const tableColIds = {
  traces: new Set(tracesTableCols.map((c) => c.id)),
  observations: new Set(observationsTableCols.map((c) => c.id)),
} as const;
const v4TableColIds = new Set<string>(eventsTableCols.map((c) => c.id));

const stringFilter = (column: string): FilterState[number] => ({
  column,
  type: "string",
  operator: "=",
  value: "x",
});

const stringOptionsFilter = (column: string): FilterState[number] => ({
  column,
  type: "stringOptions",
  operator: "any of",
  value: ["gpt-4"],
});

const arrayOptionsFilter = (column: string): FilterState[number] => ({
  column,
  type: "arrayOptions",
  operator: "any of",
  value: ["a"],
});

const rootFilter = {
  column: "isRootObservation",
  type: "boolean" as const,
  operator: "=" as const,
  value: true,
};

describe("tableTargetForView", () => {
  it("routes observations to the observations table", () => {
    expect(tableTargetForView("observations")).toBe("observations");
  });

  it("routes traces and every scores-* view to the traces table", () => {
    expect(tableTargetForView("traces")).toBe("traces");
    expect(tableTargetForView("scores-numeric")).toBe("traces");
    expect(tableTargetForView("scores-boolean")).toBe("traces");
    expect(tableTargetForView("scores-categorical")).toBe("traces");
  });
});

describe("classifyViewFiltersForTable", () => {
  it("maps trace-view dimensions to real traces table column ids (with renames)", () => {
    const filters: FilterState = [
      stringOptionsFilter("name"),
      arrayOptionsFilter("tags"),
      stringFilter("userId"),
      stringFilter("sessionId"),
      stringFilter("release"),
      stringFilter("version"),
      stringFilter("environment"),
    ];
    const { applicable, notApplicable } = classifyViewFiltersForTable(
      "traces",
      filters,
    );

    expect(applicable.map((f) => f.column)).toEqual([
      "traceName", // name -> traceName (rename)
      "traceTags", // tags -> traceTags (rename)
      "userId",
      "sessionId",
      "release",
      "version",
      "environment",
    ]);
    expect(notApplicable.size).toBe(0);
  });

  it("maps observation-view dimensions to real observations table column ids", () => {
    const filters: FilterState = [
      stringOptionsFilter("providedModelName"),
      arrayOptionsFilter("tags"),
      stringFilter("userId"),
      stringOptionsFilter("type"),
      stringOptionsFilter("level"),
      stringOptionsFilter("name"),
    ];
    const { applicable, notApplicable } = classifyViewFiltersForTable(
      "observations",
      filters,
    );

    expect(applicable.map((f) => f.column)).toEqual([
      "model", // providedModelName -> model (rename)
      "tags", // tags stays tags on the observations table
      "userId",
      "type",
      "level",
      "name",
    ]);
    expect(notApplicable.size).toBe(0);
  });

  it("drops sessionId on observations (no session column) with a reason", () => {
    const { applicable, notApplicable } = classifyViewFiltersForTable(
      "observations",
      [stringFilter("sessionId")],
    );

    expect(applicable).toHaveLength(0);
    expect(notApplicable.get("sessionId")).toMatch(/session/i);
  });

  it("drops semantic roots for the v3 observations table with a disclosed reason", () => {
    const { applicable, notApplicable } = classifyViewFiltersForTable(
      "observations",
      [rootFilter],
      "v3",
    );

    expect(applicable).toHaveLength(0);
    expect(notApplicable.get("isRootObservation")).toMatch(/v4/i);
  });

  it("maps semantic roots and observation ids to the v4 events table", () => {
    const filters: FilterState = [
      stringFilter("sessionId"),
      arrayOptionsFilter("tags"),
      stringOptionsFilter("providedModelName"),
      stringOptionsFilter("traceName"),
      stringFilter("traceVersion"),
      stringFilter("promptVersion"),
      rootFilter,
    ];
    const { applicable, notApplicable } = classifyViewFiltersForTable(
      "observations",
      filters,
      "v4",
    );

    expect(applicable.map((f) => f.column)).toEqual([
      "sessionId",
      "traceTags",
      "providedModelName",
      "traceName",
      "version",
      "isRootObservation",
    ]);
    expect(applicable.at(-1)).toEqual(rootFilter);
    expect(notApplicable.get("promptVersion")).toMatch(/numeric/i);
  });

  it.each([
    ["traces", "name", "traceName"],
    ["traces", "id", "traceId"],
    ["scores-numeric", "tags", "traceTags"],
    ["traces", "metadata", null],
    ["traces", "release", null],
    ["scores-numeric", "traceRelease", null],
    ["scores-boolean", "traceRelease", null],
    ["scores-categorical", "traceRelease", null],
  ] as const)(
    "applies the v4 $2 mapping for $1",
    (view, dimension, expectedColumn) => {
      const { applicable, notApplicable } = classifyViewFiltersForTable(
        view,
        [stringFilter(dimension)],
        "v4",
      );

      if (expectedColumn) {
        expect(applicable.map((filter) => filter.column)).toEqual([
          expectedColumn,
        ]);
        expect(notApplicable.size).toBe(0);
      } else {
        expect(applicable).toHaveLength(0);
        expect(notApplicable.has(dimension)).toBe(true);
      }
    },
  );

  it("maps only trace-derived score dimensions to the traces table, dropping score-specific ones", () => {
    const filters: FilterState = [
      stringOptionsFilter("traceName"),
      arrayOptionsFilter("tags"),
      stringFilter("userId"),
      stringFilter("traceRelease"),
      stringFilter("traceVersion"),
      stringOptionsFilter("name"), // score name
      stringOptionsFilter("source"), // score source
    ];
    const { applicable, notApplicable } = classifyViewFiltersForTable(
      "scores-numeric",
      filters,
    );

    expect(applicable.map((f) => f.column)).toEqual([
      "traceName",
      "traceTags", // tags -> traceTags (rename)
      "userId",
      "release", // traceRelease -> release (rename)
      "version", // traceVersion -> version (rename)
    ]);
    expect(notApplicable.get("name")).toMatch(/score name/i);
    expect(notApplicable.get("source")).toMatch(/score source/i);
  });

  it("preserves filter type/operator/value and only rewrites the column", () => {
    const original = stringOptionsFilter("providedModelName");
    const { applicable } = classifyViewFiltersForTable("observations", [
      original,
    ]);

    expect(applicable[0]).toEqual({
      column: "model",
      type: "stringOptions",
      operator: "any of",
      value: ["gpt-4"],
    });
    // pure: input untouched
    expect(original.column).toBe("providedModelName");
  });

  it("reports unknown columns as not-applicable with a generic reason instead of throwing", () => {
    const { applicable, notApplicable } = classifyViewFiltersForTable(
      "traces",
      [stringFilter("totallyMadeUpDimension")],
    );

    expect(applicable).toHaveLength(0);
    expect(notApplicable.get("totallyMadeUpDimension")).toContain(
      "totallyMadeUpDimension",
    );
  });

  it("collapses repeated drops of the same dimension into a single reason", () => {
    const { notApplicable } = classifyViewFiltersForTable("observations", [
      stringFilter("sessionId"),
      {
        column: "sessionId",
        type: "string",
        operator: "contains",
        value: "y",
      },
    ]);
    expect(notApplicable.size).toBe(1);
  });

  // Guards against invented / drifted column ids: every applicable target id
  // must be a real column on the view's target table.
  it("only ever emits real target-table column ids", () => {
    const probesByView: Record<ViewName, FilterState> = {
      traces: [
        stringOptionsFilter("name"),
        arrayOptionsFilter("tags"),
        stringFilter("userId"),
        stringFilter("sessionId"),
        stringFilter("metadata"),
        stringFilter("release"),
        stringFilter("version"),
        stringFilter("environment"),
        stringFilter("id"),
      ],
      observations: [
        stringOptionsFilter("traceName"),
        stringOptionsFilter("name"),
        stringFilter("userId"),
        stringFilter("metadata"),
        stringOptionsFilter("type"),
        arrayOptionsFilter("tags"),
        stringOptionsFilter("providedModelName"),
        stringOptionsFilter("level"),
        arrayOptionsFilter("toolNames"),
        arrayOptionsFilter("calledToolNames"),
        stringFilter("environment"),
        stringFilter("version"),
        stringOptionsFilter("promptName"),
        stringFilter("promptVersion"),
        stringFilter("id"),
        stringFilter("traceId"),
        stringFilter("parentObservationId"),
      ],
      "scores-numeric": [
        stringOptionsFilter("traceName"),
        arrayOptionsFilter("tags"),
        stringFilter("userId"),
        stringFilter("sessionId"),
        stringFilter("traceRelease"),
        stringFilter("traceVersion"),
      ],
      "scores-boolean": [
        stringOptionsFilter("traceName"),
        arrayOptionsFilter("tags"),
        stringFilter("userId"),
        stringFilter("sessionId"),
        stringFilter("traceRelease"),
        stringFilter("traceVersion"),
      ],
      "scores-categorical": [
        stringOptionsFilter("traceName"),
        arrayOptionsFilter("tags"),
        stringFilter("userId"),
        stringFilter("sessionId"),
        stringFilter("traceRelease"),
        stringFilter("traceVersion"),
      ],
    };

    (Object.keys(probesByView) as ViewName[]).forEach((view) => {
      const target = tableTargetForView(view);
      const { applicable } = classifyViewFiltersForTable(
        view,
        probesByView[view],
      );
      applicable.forEach((f) => {
        expect(tableColIds[target].has(f.column)).toBe(true);
      });
    });

    (Object.keys(probesByView) as ViewName[]).forEach((view) => {
      const { applicable } = classifyViewFiltersForTable(
        view,
        Object.keys(getViewDeclaration(view, "v2").dimensions).map(
          stringFilter,
        ),
        "v4",
      );
      applicable.forEach((f) => {
        expect(v4TableColIds.has(f.column)).toBe(true);
      });
    });
  });
});
