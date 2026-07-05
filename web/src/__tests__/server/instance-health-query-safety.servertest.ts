import { assertSafeDiagnosticClickHouseQuery } from "@/src/features/instance-health/server/instanceHealthService";

describe("instance health ClickHouse query safety", () => {
  it("allows bounded freshness probes against app tables", () => {
    expect(() =>
      assertSafeDiagnosticClickHouseQuery(`
        SELECT id
        FROM traces
        WHERE timestamp <= {now: DateTime64(3)}
          AND timestamp >= {now: DateTime64(3)} - INTERVAL 3 MINUTE
        LIMIT 1
      `),
    ).not.toThrow();
  });

  it("rejects app-table reads without a narrow freshness window", () => {
    expect(() =>
      assertSafeDiagnosticClickHouseQuery(`
        SELECT id
        FROM observations
        LIMIT 100
      `),
    ).toThrow("missing narrow freshness window");
  });

  it.each([
    "SELECT * FROM system.tables",
    "SELECT id FROM traces FINAL LIMIT 1",
    "OPTIMIZE TABLE traces FINAL",
    "SYSTEM FLUSH LOGS",
    "SELECT a.id FROM traces a JOIN observations b ON a.id = b.trace_id",
  ])("rejects forbidden diagnostic SQL: %s", (query) => {
    expect(() => assertSafeDiagnosticClickHouseQuery(query)).toThrow();
  });
});
