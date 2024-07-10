import { prisma } from "@langfuse/shared/src/db";

if (process.env.NEXT_MANUAL_SIG_HANDLE) {
  process.on("SIGTERM", async () => {
    console.log("Received SIGTERM: cleaning up");
    await prisma.$disconnect();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    console.log("Received SIGINT: cleaning up");
    await prisma.$disconnect();
    process.exit(0);
  });
}
