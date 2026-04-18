// This file exports the prisma db connection, the Prisma Object, and the Typescript types.
// This is not imported in the index.ts file of this package, as we must not import this into FE code.

import { Prisma, PrismaClient } from "@prisma/client";
import { env } from "process";
import { logger } from "./server";

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
  const datasourceUrl = (() => {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl || !databaseUrl.includes("langfuse_test")) {
      return undefined;
    }

    const url = new URL(databaseUrl);
    url.searchParams.set("connection_limit", "5");

    return url.toString();
  })();

  const client = new PrismaClient<
    Prisma.PrismaClientOptions,
    "warn" | "error" | "query"
  >({
    ...(datasourceUrl
      ? {
          datasources: {
            db: {
              url: datasourceUrl,
            },
          },
        }
      : {}),
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

declare const globalThis: {
  prismaGlobal: PrismaClient | undefined;
} & typeof global;

type PrismaProcess = NodeJS.Process & {
  __langfusePrismaClient?: PrismaClient;
};

const prismaProcess = process as PrismaProcess;

prismaProcess.__langfusePrismaClient ??=
  globalThis.prismaGlobal ?? createPrismaInstance();
globalThis.prismaGlobal = prismaProcess.__langfusePrismaClient;

export const prisma = prismaProcess.__langfusePrismaClient;

export * from "@prisma/client";
