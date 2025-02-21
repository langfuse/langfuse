export default async function teardown() {
  const { redis } = await import("@langfuse/shared/src/server");
  const { prisma } = await import("@langfuse/shared/src/db");
  console.log(`Redis status ${redis?.status}`);
  if (!redis) {
    return;
  }
  if (redis.status === "end" || redis.status === "close") {
    console.log("Redis connection already closed");
    return;
  }
  redis?.disconnect();
  await prisma.$disconnect();
  console.log("Teardown complete");
}
