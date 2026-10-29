// Leave headroom for sending an actionable error before the load balancer's 30s timeout.
// Use only for tools that execute a single ClickHouse query per call.
export const MCP_CLICKHOUSE_SETTINGS = { max_execution_time: 25 } as const;
