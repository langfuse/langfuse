/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { Session } from "next-auth";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { BatchExportFileFormat, ModelUsageUnit } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

describe("observations.export RPC", () => {
  const numberOfGenerations = 5;
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  beforeAll(async () => {
    // Disable S3 upload
    process.env.S3_ENDPOINT = "";

    await pruneDatabase();
    const traceId = "trace-1";

    await prisma.trace.create({
      data: {
        id: traceId,
        name: "trace-name",
        userId: "user-1",
        projectId,
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
    });

    for (let i = 1; i <= numberOfGenerations; i++) {
      await prisma.observation.create({
        data: {
          type: "GENERATION",
          id: `generation-${i}`,
          name: `generation-${i}`,
          model: "gpt-3.5-turbo",
          totalCost: 1,
          startTime: new Date("2021-01-01T00:00:00.000Z"),
          endTime: new Date("2021-01-01T00:00:05.000Z"),
          project: { connect: { id: projectId } },
          traceId,
          input: [
            {
              role: "system",
              content: "Be a helpful assistant",
            },
            {
              role: "user",
              content: "How can i create a React component?",
            },
          ],
          output: {
            completion: `Creating a React component can be done in two ways.`,
          },
          metadata: {
            user: `user-@langfuse.com`,
          },
          unit: ModelUsageUnit.Tokens,
        },
      });
    }
  });

  afterAll(async () => await pruneDatabase());

  const session: Session = {
    expires: "1",
    user: {
      id: "clgb17vnp000008jjere5g15i",
      name: "John Doe",
      projects: [
        {
          id: projectId,
          role: "ADMIN",
          name: "test",
        },
      ],
      featureFlags: {
        templateFlag: true,
      },
      admin: true,
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  it("should return a CSV file", async () => {
    const result = await caller.generations.export({
      fileFormat: BatchExportFileFormat.CSV,
      orderBy: { column: "id", order: "ASC" },
      filter: [
        {
          column: "Start Time",
          type: "datetime",
          operator: ">",
          value: new Date("1990-01-01"),
        },
      ],
      projectId,
      searchQuery: null,
    });

    if (result.type !== "data")
      throw new Error("No data returned. Is S3 accidentally enabled?");
    const { data, fileName } = result;

    const fileExtension = fileName.split(".").pop();
    expect(fileName).toContain(`lf-export-${projectId}`);
    expect(fileExtension).toBe("csv");
    expect(data.split("\n").filter(Boolean).length).toBe(
      numberOfGenerations + 1,
    );
  });

  it("should return a JSON file", async () => {
    const result = await caller.generations.export({
      fileFormat: BatchExportFileFormat.JSON,
      orderBy: { column: "id", order: "ASC" },
      filter: [
        {
          column: "Start Time",
          type: "datetime",
          operator: ">",
          value: new Date("1990-01-01"),
        },
      ],
      projectId,
      searchQuery: null,
    });

    if (result.type !== "data")
      throw new Error("No data returned. Is S3 accidentally enabled?");
    const { data, fileName } = result;

    const fileExtension = fileName.split(".").pop();
    expect(fileName).toContain(`lf-export-${projectId}`);
    expect(fileExtension).toBe("json");

    expect(JSON.parse(data).length).toBe(numberOfGenerations);
  });

  it("should throw on unsupported file formats", async () => {
    const unsupportedFileFormat = "XLSX";

    const call = caller.generations.export({
      fileFormat: unsupportedFileFormat as unknown as BatchExportFileFormat,
      orderBy: { column: "id", order: "ASC" },
      filter: [
        {
          column: "Start Time",
          type: "datetime",
          operator: ">",
          value: new Date("1990-01-01"),
        },
      ],
      projectId,
      searchQuery: null,
    });

    await expect(call).rejects.toThrow();
  });
});
