export default async function teardown() {
  const { redis } = await import("@langfuse/shared/src/server");
  console.log(`Redis status ${redis?.status}`);
  if (!redis) {
    return;
  }
  if (redis.status === "end" || redis.status === "close") {
    console.log("Redis connection already closed");
    return;
  }
  redis?.disconnect();
  console.log("Teardown complete");
}
