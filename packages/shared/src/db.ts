// This file exports the prisma db connection, the Prisma Object, and the Typescript types.
// This is not imported in the index.ts file of this package, as we must not import this into FE code.

import { Prisma, PrismaClient } from "@prisma/client";
import { env } from "process";
import kyselyExtension from "prisma-extension-kysely";
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { DB } from ".";
import { getLogger } from "./server";

export class PrismaClientSingleton {
  private static instance: PrismaClient;

  public static getInstance(): PrismaClient {
    if (PrismaClientSingleton.instance) {
      return PrismaClientSingleton.instance;
    }

    PrismaClientSingleton.instance = createPrismaInstance();

    return PrismaClientSingleton.instance;
  }
}

const createPrismaInstance = () => {
  const logger = getLogger(); // Use lazy logger
  const client = new PrismaClient<
    Prisma.PrismaClientOptions,
    "warn" | "error" | "query"
  >({
    log: [
      { emit: "event", level: "query" },
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });

  if (env.NODE_ENV === "development") {
    client.$on("query", (event) => {
      logger.info(`prisma:query ${event.query}, ${event.duration}ms`);
    });
  }

  client.$on("warn", (event) => {
    logger.warn(`prisma:warn ${event.message}`);
  });

  client.$on("error", (event) => {
    logger.error(`prisma:error ${event.message}`);
  });
  return client;
};

export class KyselySingleton {
  private static instance: { $kysely: Kysely<DB> };

  public static getInstance() {
    if (KyselySingleton.instance) {
      return KyselySingleton.instance;
    }

    KyselySingleton.instance = PrismaClientSingleton.getInstance().$extends(
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
      }),
    );

    return KyselySingleton.instance;
  }
}

declare const globalThis: {
  prismaGlobal: PrismaClient | undefined;
  kyselyPrismaGlobal: { $kysely: Kysely<DB> } | undefined;
} & typeof global;

export function getPrisma(): PrismaClient {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.NODE_ENV === "development") {
    globalThis.prismaGlobal ??= createPrismaInstance();
    return globalThis.prismaGlobal;
  }
  return PrismaClientSingleton.getInstance();
}

const createKyselyInstance = () => {
  return getPrisma().$extends(
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
    }),
  );
};

export function getKyselyPrisma() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.NODE_ENV === "development") {
    globalThis.kyselyPrismaGlobal ??= createKyselyInstance();
    return globalThis.kyselyPrismaGlobal;
  }
  return KyselySingleton.getInstance();
}

// Backward compatibility with proxy
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    const actualPrisma = getPrisma();
    const value = actualPrisma[prop as keyof PrismaClient];
    return typeof value === "function" ? value.bind(actualPrisma) : value;
  },
});

export const kyselyPrisma = new Proxy({} as { $kysely: Kysely<DB> }, {
  get(target, prop) {
    const actualKysely = getKyselyPrisma();
    const value = actualKysely[prop as keyof typeof actualKysely];
    return typeof value === "function"
      ? (value as Function).bind(actualKysely)
      : value;
  },
});

export * from "@prisma/client";
