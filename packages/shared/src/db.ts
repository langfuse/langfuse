// This file exports the prisma db connection, the Prisma Object, and the Typescript types.
// This is not imported in the index.ts file of this package, as we must not import this into FE code.

import { PrismaClient } from "@prisma/client";
import { env } from "process";
import kyselyExtension from "prisma-extension-kysely";
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { DB } from ".";

// Instantiated according to the Prisma documentation
// https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices

const prismaClientSingleton = () => {
  return new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error", "warn"],
  });
};

const kyselySingleton = (prismaClient: PrismaClient) => {
  return prismaClient.$extends(
    kyselyExtension({
      kysely: (driver) =>
        new Kysely<DB>({
          dialect: {
            // This is where the magic happens!
            createDriver: () => driver,
            // Don't forget to customize these to match your database!
            createAdapter: () => new PostgresAdapter(),
            createIntrospector: (db) => new PostgresIntrospector(db),
            createQueryCompiler: () => new PostgresQueryCompiler(),
          },
        }),
    })
  );
};
declare global {
  // eslint-disable-next-line no-var
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
  var kyselyPrisma: undefined | ReturnType<typeof kyselySingleton>;
}

export const prisma = globalThis.prisma ?? prismaClientSingleton();
export const kyselyPrisma = globalThis.kyselyPrisma ?? kyselySingleton(prisma);

export * from "@prisma/client";

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;
