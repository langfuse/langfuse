import { prisma } from "@langfuse/shared/src/db";

const allUserIds = await prisma.user.findMany({
  select: {
    id: true,
  },
});

console.log("All user ids", allUserIds);
