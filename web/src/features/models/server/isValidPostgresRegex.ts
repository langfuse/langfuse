import { Prisma, type prisma as _prisma } from "@langfuse/shared/src/db";
import { isOceanBase } from "@langfuse/shared/src/server";

export const isValidPostgresRegex = async (
  regex: string,
  prisma: typeof _prisma,
): Promise<boolean> => {
  try {
    if (isOceanBase()) {
      // OceanBase/MySQL uses REGEXP operator instead of ~
      await prisma.$queryRaw(Prisma.sql`SELECT 'test_string' REGEXP ${regex}`);
    } else {
      // PostgreSQL uses ~ operator
      await prisma.$queryRaw(Prisma.sql`SELECT 'test_string' ~ ${regex}`);
    }
    return true;
  } catch {
    return false;
  }
};
