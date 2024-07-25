export default async function teardown() {
  if (window === undefined) {
    const { redis } = await import("@langfuse/shared/src/server");
    console.log(`Redis status ${redis?.status}`);
    if (!redis) {
      return;
    }
    if (redis.status === "end") {
      console.log("Redis connection already closed");
      return;
    }
    redis?.disconnect();
    console.log("Teardown complete");
  }
}
