/** @jest-environment node */

import { createMocks } from "node-mocks-http";
import handler from "@/src/pages/api/public/ingestion";
import { type NextApiResponse, type NextApiRequest } from "next";
import { Prisma } from "@langfuse/shared/src/db";

/*

ERROR	Error verifying auth header:  PrismaClientKnownRequestError: 
Invalid `prisma.apiKey.findUnique()` invocation:
Server has closed the connection.
    at ai.handleRequestError (/var/task/node_modules/shared/runtime/library.js:126:6775)
    at ai.handleAndLogRequestError (/var/task/node_modules/shared/runtime/library.js:126:6109)
    at ai.request (/var/task/node_modules/shared/runtime/library.js:126:5817)
    at async l (/var/task/node_modules/shared/runtime/library.js:131:9709)
    at async d (/var/task/.next/server/chunks/5811.js:1:9768)
    at async f (/var/task/.next/server/pages/api/public/generations.js:1:1026)
    at async /var/task/node_modules/@sentry/nextjs/cjs/common/wrapApiHandlerWithSentry.js:136:41
    at async K (/var/task/node_modules/next/dist/compiled/next-server/pages-api.runtime.prod.js:20:16545)
    at async U.render (/var/task/node_modules/next/dist/compiled/next-server/pages-api.runtime.prod.js:20:16981)
    at async r3.runApi (/var/task/node_modules/next/dist/compiled/next-server/server.runtime.prod.js:17:41752) {
  code: 'P1017',
  clientVersion: '5.9.1',
  meta: { modelName: 'ApiKey' }
*/
/*
ERROR	Error verifying auth header:  PrismaClientKnownRequestError: 
Invalid `prisma.apiKey.findUnique()` invocation:
Timed out fetching a new connection from the connection pool. More info:  (Current connection pool timeout: 10, connection limit: 1)
    at ai.handleRequestError (/var/task/node_modules/shared/runtime/library.js:126:6775)
    at ai.handleAndLogRequestError (/var/task/node_modules/shared/runtime/library.js:126:6109)
    at ai.request (/var/task/node_modules/shared/runtime/library.js:126:5817)
    at async l (/var/task/node_modules/shared/runtime/library.js:131:9709)
    at async l (/var/task/.next/server/chunks/5811.js:1:9768)
    at async y (/var/task/.next/server/pages/api/public/spans.js:1:1018)
    at async /var/task/node_modules/@sentry/nextjs/cjs/common/wrapApiHandlerWithSentry.js:136:41
    at async K (/var/task/node_modules/next/dist/compiled/next-server/pages-api.runtime.prod.js:20:16545)
    at async U.render (/var/task/node_modules/next/dist/compiled/next-server/pages-api.runtime.prod.js:20:16981)
    at async r3.runApi (/var/task/node_modules/next/dist/compiled/next-server/server.runtime.prod.js:17:41752) {
  code: 'P2024',
  clientVersion: '5.9.1',
  meta: { modelName: 'ApiKey', connection_limit: 1, timeout: 10 }
*/

jest.mock("@langfuse/shared/src/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const originalModule = jest.requireActual("@langfuse/shared/src/db");

  // Create a mock for PrismaClient
  const mockPrismaClient = {
    apiKey: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(() => {
        throw new Prisma.PrismaClientKnownRequestError(
          "Timed out fetching a new connection from the connection pool. More info: (Current connection pool timeout: 10, connection limit: 1)",
          {
            code: "P2024",
            clientVersion: "5.9.1",
            meta: { modelName: "ApiKey", connection_limit: 1, timeout: 10 },
          },
        );
      }),
      findUniqueOrThrow: jest.fn(),
      findFirstOrThrow: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    __esModule: true,
    ...originalModule,
    prisma: mockPrismaClient,
  };
});

describe("/api/public/ingestion API Endpoint", () => {
  it(`should return 500 for prisma exception`, async () => {
    const { req, res } = createMocks({
      method: "POST",
      headers: {
        authorization: "Bearer mock-token",
      },
      body: {},
    });

    // Extend the req object to include the missing env property
    const extendedReq = req as unknown as NextApiRequest;
    // Cast the res object to NextApiResponse to satisfy the type requirement
    const extendedRes = res as unknown as NextApiResponse;

    await handler(extendedReq, extendedRes);
    expect(res._getStatusCode()).toBe(500);
  });
});
