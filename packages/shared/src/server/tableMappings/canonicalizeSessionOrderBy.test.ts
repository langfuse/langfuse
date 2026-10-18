import { describe, expect, it } from "vitest";

import { orderByToClickhouseSql } from "../queries/clickhouse-sql/orderby-factory";
import {
  canonicalizeSessionOrderBy,
  sessionCols,
  sessionEventsOrderByCols,
} from "./mapSessionTable";

describe("canonicalizeSessionOrderBy", () => {
  it("maps leaked traces/events latency onto sessionDuration", () => {
    expect(
      canonicalizeSessionOrderBy(
        { column: "latency", order: "DESC" },
        sessionEventsOrderByCols,
      ),
    ).toEqual({ column: "sessionDuration", order: "DESC" });

    expect(
      canonicalizeSessionOrderBy(
        { column: "latency", order: "ASC" },
        sessionCols,
      ),
    ).toEqual({ column: "sessionDuration", order: "ASC" });
  });

  it("keeps canonical session columns", () => {
    expect(
      canonicalizeSessionOrderBy(
        { column: "sessionDuration", order: "DESC" },
        sessionEventsOrderByCols,
      ),
    ).toEqual({ column: "sessionDuration", order: "DESC" });
  });

  it("falls back to createdAt for columns that do not exist on sessions", () => {
    expect(
      canonicalizeSessionOrderBy(
        { column: "timeToFirstToken", order: "ASC" },
        sessionEventsOrderByCols,
      ),
    ).toEqual({ column: "createdAt", order: "DESC" });
  });

  it("lets ClickHouse order-by SQL accept leaked latency", () => {
    expect(
      orderByToClickhouseSql(
        { column: "latency", order: "DESC" },
        sessionEventsOrderByCols,
      ),
    ).toBe("ORDER BY duration DESC");
  });
});
