import { type Prisma, PrismaClient } from "@prisma/client";

import { env } from "@/src/env.mjs";
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { type DB } from "@/prisma/generated/types";
import kyselyExtension from "prisma-extension-kysely";
import {
  type DynamicClientExtensionThis,
  type InternalArgs,
} from "@prisma/client/runtime/library";

const globalForPrisma = globalThis as unknown as {
  prisma:
    | (PrismaClient<Prisma.PrismaClientOptions, never> & {
        client: {
          $kysely: () => Kysely<DB>;
        };
      })
    | DynamicClientExtensionThis<
        Prisma.TypeMap<
          InternalArgs & {
            client: {
              $kysely: () => Kysely<DB>;
            };
          }
        >,
        Prisma.TypeMapCb,
        {
          client: {
            $kysely: () => Kysely<DB>;
          };
        }
      >
    | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  }).$extends(
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
          plugins: [
            // Add your favorite plugins here!
          ],
        }),
    }),
  );

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
