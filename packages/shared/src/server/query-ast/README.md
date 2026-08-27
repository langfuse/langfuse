# query-ast (server)

Server-only half of the query-builder AST module.

- `goldenHarness.ts` — WP0 capture/`clickhouse format` harness. Shared across
  library-evaluation arms; not library-specific.
- `hypequery/` — this branch's arm: ClickHouse queries as walkable hypequery
  nodes, compiled through a mandatory tenancy choke point.

See `hypequery/README.md` for the arm notes (transformer cost, type friction,
conditions 7 and 8).
