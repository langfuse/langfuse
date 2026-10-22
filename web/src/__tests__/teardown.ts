export default async function teardown() {
  // Redis records the existing non-production singleton on globalThis.
  // Importing its module here would create a connection for otherwise pure tests.
  const redis = globalThis.redis;
  if (redis && redis.status !== "end" && redis.status !== "close") {
    redis.disconnect();
  }

  const { ClickHouseClientManager } =
    await import("@langfuse/shared/src/server/clickhouse");
  await ClickHouseClientManager.getInstance().closeAllConnections();
}
