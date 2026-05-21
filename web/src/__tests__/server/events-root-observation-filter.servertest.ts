import {
  eventsTableCols,
  eventsTableHasParentObservationSql,
  eventsTableIsRootObservationSql,
} from "@langfuse/shared";
import { createFilterFromFilterState } from "@langfuse/shared/src/server";

describe("events root observation filter", () => {
  const getColumn = (id: string) => {
    const column = eventsTableCols.find((candidate) => candidate.id === id);
    if (!column) {
      throw new Error(`${id} column definition is missing`);
    }
    return column;
  };

  it("keeps hasParentObservation as the literal parent-pointer predicate", () => {
    const column = getColumn("hasParentObservation");
    const [filter] = createFilterFromFilterState(
      [
        {
          column: "hasParentObservation",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ],
      [
        {
          uiTableName: column.name,
          uiTableId: column.id,
          clickhouseTableName: "events_proto",
          clickhouseSelect: column.internal,
        },
      ],
      eventsTableCols,
    );

    const { query, params } = filter.apply();
    const [paramName] = Object.keys(params);

    expect(eventsTableHasParentObservationSql).toBe(
      "(e.parent_span_id != '' AND e.parent_span_id IS NOT NULL)",
    );
    expect(query).toBe(
      `${eventsTableHasParentObservationSql} = {${paramName}: Boolean}`,
    );
    expect(params).toEqual({ [paramName]: true });
  });

  it("maps isRootObservation to parentless observations or SDK app roots", () => {
    const column = getColumn("isRootObservation");
    const [filter] = createFilterFromFilterState(
      [
        {
          column: "isRootObservation",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ],
      [
        {
          uiTableName: column.name,
          uiTableId: column.id,
          clickhouseTableName: "events_proto",
          clickhouseSelect: column.internal,
        },
      ],
      eventsTableCols,
    );

    const { query, params } = filter.apply();
    const [paramName] = Object.keys(params);

    expect(eventsTableIsRootObservationSql).toContain("e.parent_span_id");
    expect(eventsTableIsRootObservationSql).toContain("e.is_app_root");
    expect(eventsTableIsRootObservationSql).not.toContain("ifNull");
    expect(query).toBe(
      `${eventsTableIsRootObservationSql} = {${paramName}: Boolean}`,
    );
    expect(params).toEqual({ [paramName]: true });
  });
});
