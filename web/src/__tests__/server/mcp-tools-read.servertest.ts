// Mock queue operations to avoid Redis dependency in tests
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    // Mock queue getInstance to return a no-op queue
    EventPropagationQueue: {
      getInstance: () => ({
        add: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
      }),
    },
  };
});

vi.mock("@/src/features/media/server/getMediaStorageClient", () => ({
  getMediaStorageServiceClient: () => ({
    getSignedUrl: vi.fn().mockResolvedValue("https://media.example/download"),
  }),
}));

import { nanoid } from "nanoid";
import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import {
  createEvent,
  createEventsCh,
  createScoresCh,
  createTraceScore,
} from "@langfuse/shared/src/server";
import { ScoreConfigDataType } from "@langfuse/shared";
import {
  createMcpTestSetup,
  createPromptInDb,
  mockServerContext,
  verifyAuditLog,
  verifyToolAnnotations,
} from "./mcp-helpers";
import { env } from "@/src/env.mjs";
import "@/src/features/mcp/server/bootstrap";
import { toolRegistry } from "@/src/features/mcp/server/registry";

// Import MCP tool handlers directly
import {
  getObservationTool,
  handleGetObservation,
} from "@/src/features/mcp/features/observations/tools/getObservation";
import {
  getObservationFieldSchemaTool,
  handleGetObservationFieldSchema,
} from "@/src/features/mcp/features/observations/tools/getObservationFieldSchema";
import {
  getObservationFilterSchemaTool,
  handleGetObservationFilterSchema,
} from "@/src/features/mcp/features/observations/tools/getObservationFilterSchema";
import {
  getObservationFilterValuesTool,
  handleGetObservationFilterValues,
} from "@/src/features/mcp/features/observations/tools/getObservationFilterValues";
import {
  listObservationsTool,
  handleListObservations,
} from "@/src/features/mcp/features/observations/tools/listObservations";
import {
  getMetricsSchemaTool,
  handleGetMetricsSchema,
} from "@/src/features/mcp/features/metrics/tools/getMetricsSchema";
import {
  queryMetricsTool,
  handleQueryMetrics,
} from "@/src/features/mcp/features/metrics/tools/queryMetrics";
import {
  getPromptTool,
  handleGetPrompt,
} from "@/src/features/mcp/features/prompts/tools/getPrompt";
import {
  getPromptUnresolvedTool,
  handleGetPromptUnresolved,
} from "@/src/features/mcp/features/prompts/tools/getPromptUnresolved";
import {
  listPromptsTool,
  handleListPrompts,
} from "@/src/features/mcp/features/prompts/tools/listPrompts";
import {
  createScoreConfigTool,
  handleCreateScoreConfig,
} from "@/src/features/mcp/features/scores/tools/createScoreConfig";
import {
  createScoreTool,
  handleCreateScore,
} from "@/src/features/mcp/features/scores/tools/createScore";
import {
  deleteScoreConfigTool,
  handleDeleteScoreConfig,
} from "@/src/features/mcp/features/scores/tools/deleteScoreConfig";
import {
  getScoreTool,
  handleGetScore,
} from "@/src/features/mcp/features/scores/tools/getScore";
import {
  getScoreConfigTool,
  handleGetScoreConfig,
} from "@/src/features/mcp/features/scores/tools/getScoreConfig";
import {
  listScoreConfigsTool,
  handleListScoreConfigs,
} from "@/src/features/mcp/features/scores/tools/listScoreConfigs";
import {
  listScoresTool,
  handleListScores,
} from "@/src/features/mcp/features/scores/tools/listScores";
import {
  updateScoreConfigTool,
  handleUpdateScoreConfig,
} from "@/src/features/mcp/features/scores/tools/updateScoreConfig";
import {
  getMediaTool,
  handleGetMedia,
} from "@/src/features/mcp/features/media/tools/getMedia";
import {
  GetDatasetItemsMcpInput,
  GetDatasetMcpInput,
  GetDatasetRunMcpInput,
  GetDatasetRunsMcpInput,
  GetDatasetsMcpInput,
} from "@/src/features/mcp/features/datasets/schema";

const maybeEventsTable =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true"
    ? describe
    : describe.skip;
const maybeEventsTableIt =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true" ? it : it.skip;

const createObservationEvent = (params: {
  projectId: string;
  traceId?: string;
  observationId?: string;
  name?: string;
  type?: "GENERATION" | "SPAN" | "EVENT";
  startTime?: Date;
  parentObservationId?: string | null;
  providedModelName?: string;
  input?: string;
  output?: string;
  metadata?: Record<string, string>;
  tags?: string[];
  userId?: string;
  sessionId?: string;
  totalCost?: number;
}) => {
  const observationId = params.observationId ?? randomUUID();
  const startTime = params.startTime ?? new Date();
  const metadata = params.metadata ?? { source: "mcp-test" };
  const metadataKeys = Object.keys(metadata).sort();

  return createEvent({
    id: observationId,
    span_id: observationId,
    trace_id: params.traceId ?? randomUUID(),
    parent_span_id: params.parentObservationId ?? null,
    project_id: params.projectId,
    name: params.name ?? `mcp-observation-${nanoid()}`,
    type: params.type ?? "GENERATION",
    level: "DEFAULT",
    start_time: startTime.getTime() * 1000,
    end_time: startTime.getTime() * 1000 + 1000 * 1000,
    input: params.input ?? "Observation input",
    output: params.output ?? "Observation output",
    metadata_names: metadataKeys,
    metadata_values: metadataKeys.map((key) => metadata[key]),
    provided_model_name: params.providedModelName ?? "gpt-4o-mini",
    ...(params.totalCost === undefined
      ? {}
      : { cost_details: { total: params.totalCost } }),
    tags: params.tags ?? [],
    user_id: params.userId ?? null,
    session_id: params.sessionId ?? null,
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const containsStringValue = (value: unknown, expected: string): boolean => {
  if (typeof value === "string") {
    return value.includes(expected);
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsStringValue(item, expected));
  }

  if (isRecord(value)) {
    return Object.values(value).some((item) =>
      containsStringValue(item, expected),
    );
  }

  return false;
};

const containsPropertyName = (value: unknown, expected: string): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => containsPropertyName(item, expected));
  }

  if (isRecord(value)) {
    return (
      Object.keys(value).includes(expected) ||
      Object.values(value).some((item) => containsPropertyName(item, expected))
    );
  }

  return false;
};

describe("MCP Read Tools", () => {
  describe("dataset tool schemas", () => {
    it("uses dataset IDs for existing dataset read addressing", () => {
      for (const schema of [
        GetDatasetMcpInput,
        GetDatasetItemsMcpInput,
        GetDatasetRunsMcpInput,
        GetDatasetRunMcpInput,
      ]) {
        const jsonSchema = z.toJSONSchema(schema, { unrepresentable: "any" });
        const properties = jsonSchema.properties as Record<string, unknown>;

        expect(properties).toHaveProperty("datasetId");
        expect(properties).not.toHaveProperty("datasetName");
        expect(properties).not.toHaveProperty("name");
      }
    });

    it("keeps dataset names only as a listDatasets discovery filter", () => {
      const jsonSchema = z.toJSONSchema(GetDatasetsMcpInput, {
        unrepresentable: "any",
      });
      const properties = jsonSchema.properties as Record<string, unknown>;

      expect(properties).toHaveProperty("name");
      expect(properties).not.toHaveProperty("datasetId");
    });
  });

  describe("getMedia tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(getMediaTool, { readOnlyHint: true });
    });

    it("should return media metadata and a signed download URL", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const mediaId = `mcp-media-${nanoid()}`;
      const uploadedAt = new Date("2026-01-01T00:00:00.000Z");

      await prisma.media.create({
        data: {
          id: mediaId,
          projectId,
          sha256Hash: createHash("sha256").update(mediaId).digest("base64"),
          bucketPath: `${projectId}/${mediaId}.png`,
          bucketName: "media-test-bucket",
          contentType: "image/png",
          contentLength: 123n,
          uploadedAt,
          uploadHttpStatus: 200,
        },
      });

      const result = (await handleGetMedia({ mediaId }, context)) as {
        mediaId: string;
        contentType: string;
        contentLength: number;
        uploadedAt: Date;
        url: string;
        urlExpiry: string;
      };

      expect(result).toMatchObject({
        mediaId,
        contentType: "image/png",
        contentLength: 123,
        url: "https://media.example/download",
      });
      expect(result.uploadedAt).toEqual(uploadedAt);
      expect(new Date(result.urlExpiry).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("getObservationFieldSchema tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(getObservationFieldSchemaTool, {
        readOnlyHint: true,
      });
    });

    maybeEventsTableIt("should be available to in-app agent keys", async () => {
      const context = mockServerContext({ isInAppAgentKey: true });

      await expect(
        toolRegistry.getEnabledTool(
          getObservationFieldSchemaTool.name,
          context,
        ),
      ).resolves.toBeDefined();
    });

    it("should return the observation projection field schema", async () => {
      const { context } = await createMcpTestSetup();

      const result = (await handleGetObservationFieldSchema({}, context)) as {
        resource: string;
        defaultFields: string[];
        fields: Record<
          string,
          {
            type: string;
            nullable: boolean;
            default: boolean;
            expensive: boolean;
            sensitive: boolean;
            description?: string;
          }
        >;
      };

      expect(result.resource).toBe("observation");
      expect(result.defaultFields).toEqual(
        expect.arrayContaining([
          "id",
          "traceId",
          "parentObservationId",
          "name",
          "type",
          "level",
          "statusMessage",
          "startTime",
          "endTime",
          "latency",
          "providedModelName",
        ]),
      );
      expect(result.fields.providedModelName.default).toBe(true);
      expect(result.fields.providedModelName.type).toBe("string");
      expect(result.fields.providedModelName.nullable).toBe(true);
      expect(result.fields.startTime.type).toBe("datetime");
      expect(result.fields.startTime.nullable).toBe(false);
      expect(result.fields.costDetails.type).toBe("map<string, number>");
      expect(result.fields.input.expensive).toBe(true);
      expect(result.fields.input.sensitive).toBe(true);
      expect(result.fields.metadata.expensive).toBe(true);
      expect(result.fields.metadata.description).toContain(
        "truncated to 200 UTF-8 characters per key",
      );
      expect(result.fields.userId.sensitive).toBe(true);
    });
  });

  describe("getObservationFilterSchema tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(getObservationFilterSchemaTool, {
        readOnlyHint: true,
      });
    });

    maybeEventsTableIt("should be available to in-app agent keys", async () => {
      const context = mockServerContext({ isInAppAgentKey: true });

      await expect(
        toolRegistry.getEnabledTool(
          getObservationFilterSchemaTool.name,
          context,
        ),
      ).resolves.toBeDefined();
    });

    it("should return public-compatible observation filter schema", async () => {
      const { context } = await createMcpTestSetup();

      const result = (await handleGetObservationFilterSchema({}, context)) as {
        resource: string;
        columns: Record<string, { type: string; operators: string[] }>;
      };

      expect(result.resource).toBe("observation");
      expect(result.columns.providedModelName.type).toBe("stringOptions");
      expect(result.columns.tags.type).toBe("arrayOptions");
      expect(result.columns.traceTags).toBeUndefined();
      expect(result.columns.comments).toBeUndefined();
      expect(result.columns.scores).toBeUndefined();
      expect(result.columns.name.operators).toContain("any of");
    });

    it.each([
      ["name", "stringOptions", true],
      ["type", "stringOptions", false],
      ["environment", "stringOptions", true],
      ["version", "string", true],
      ["userId", "string", true],
      ["sessionId", "string", true],
      ["traceName", "stringOptions", true],
      ["level", "stringOptions", false],
      ["promptName", "stringOptions", true],
      ["modelId", "stringOptions", true],
      ["providedModelName", "stringOptions", true],
      ["tags", "arrayOptions", false],
      ["hasParentObservation", "boolean", false],
    ])(
      "should expose the %s column used by observation filter values",
      async (column, type, nullable) => {
        const { context } = await createMcpTestSetup();

        const result = (await handleGetObservationFilterSchema(
          {},
          context,
        )) as {
          columns: Record<
            string,
            { type: string; operators: string[]; nullable: boolean }
          >;
        };

        expect(result.columns[column]).toEqual(
          expect.objectContaining({
            type,
            nullable,
            operators: expect.any(Array),
          }),
        );
        expect(result.columns[column]?.operators.length).toBeGreaterThan(0);
      },
    );
  });

  maybeEventsTable("listObservations tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(listObservationsTool, { readOnlyHint: true });
    });

    it("should be available to in-app agent keys", async () => {
      const context = mockServerContext({ isInAppAgentKey: true });

      await expect(
        toolRegistry.getEnabledTool(listObservationsTool.name, context),
      ).resolves.toBeDefined();
    });

    it("should expose object-shaped advanced filters in the tool schema", () => {
      const filterSchema = listObservationsTool.inputSchema.properties
        .filter as
        | {
            type?: string;
            items?: {
              anyOf?: Array<{
                type?: string;
                properties?: Record<
                  string,
                  {
                    const?: unknown;
                    enum?: unknown[];
                    type?: string;
                  }
                >;
                required?: string[];
              }>;
              oneOf?: Array<{
                type?: string;
                properties?: Record<
                  string,
                  {
                    const?: unknown;
                    enum?: unknown[];
                    type?: string;
                  }
                >;
                required?: string[];
              }>;
            };
          }
        | undefined;

      expect(filterSchema?.type).toBe("array");
      const filterVariants =
        filterSchema?.items?.anyOf ?? filterSchema?.items?.oneOf;
      const totalCostSchemas =
        filterVariants?.filter(
          (schema) =>
            schema.properties?.column?.const === "totalCost" ||
            schema.properties?.column?.enum?.includes("totalCost"),
        ) ?? [];
      const totalCostSchema = totalCostSchemas[0];

      expect(totalCostSchemas).not.toHaveLength(0);
      expect(
        totalCostSchemas.every(
          (schema) => schema.properties?.type?.const === "number",
        ),
      ).toBe(true);

      expect(totalCostSchema?.type).toBe("object");
      expect(totalCostSchema?.required).toEqual(
        expect.arrayContaining(["column", "operator", "value"]),
      );
      expect(totalCostSchema?.required).not.toContain("type");
      expect(totalCostSchema?.properties?.type?.const).toBe("number");
      expect(totalCostSchema?.properties?.operator?.enum).toEqual(
        expect.arrayContaining([">", "<", ">=", "<="]),
      );
      expect(totalCostSchema?.properties?.value?.type).toBe("number");
    });

    it("should list observations with compact default projection", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const traceId = randomUUID();
      const observation = createObservationEvent({
        projectId,
        traceId,
        name: `mcp-list-default-${nanoid()}`,
        input: "hidden input",
        output: "hidden output",
        metadata: { hidden: "metadata" },
      });

      await createEventsCh([observation]);

      const result = (await handleListObservations(
        { traceId, limit: 100 },
        context,
      )) as {
        data: Array<Record<string, unknown>>;
        meta: Record<string, unknown>;
      };

      const createdObservation = result.data.find(
        (item) => item.id === observation.id,
      );

      expect(createdObservation).toBeDefined();
      expect(createdObservation).toMatchObject({
        id: observation.id,
        traceId,
        name: observation.name,
        type: "GENERATION",
        level: "DEFAULT",
        providedModelName: "gpt-4o-mini",
      });
      expect(createdObservation?.input).toBeUndefined();
      expect(createdObservation?.output).toBeUndefined();
      expect(createdObservation?.metadata).toBeUndefined();
      expect(result.meta).toBeDefined();
    });

    it("should list observations with an in-app agent context", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const traceId = randomUUID();
      const observation = createObservationEvent({
        projectId,
        traceId,
        name: `mcp-list-in-app-agent-${nanoid()}`,
      });

      await createEventsCh([observation]);

      const result = (await handleListObservations(
        { traceId, fields: ["id"], limit: 100 },
        { ...context, isInAppAgentKey: true },
      )) as { data: Array<{ id: string }> };

      expect(result.data.map((item) => item.id)).toContain(observation.id);
    });

    it("should project only requested fields", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const traceId = randomUUID();
      const observation = createObservationEvent({
        projectId,
        traceId,
        name: `mcp-list-fields-${nanoid()}`,
      });

      await createEventsCh([observation]);

      const result = (await handleListObservations(
        { traceId, fields: ["id", "name", "type"], limit: 100 },
        context,
      )) as { data: Array<Record<string, unknown>> };

      const createdObservation = result.data.find(
        (item) => item.id === observation.id,
      );

      expect(createdObservation).toEqual({
        id: observation.id,
        name: observation.name,
        type: "GENERATION",
      });
    });

    it("should include payload fields when requested with wildcard projection", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const traceId = randomUUID();
      const observation = createObservationEvent({
        projectId,
        traceId,
        name: `mcp-list-wildcard-${nanoid()}`,
        input: "visible input",
        output: "visible output",
        metadata: { customer: "acme" },
      });

      await createEventsCh([observation]);

      const result = (await handleListObservations(
        { traceId, fields: ["*"], limit: 100 },
        context,
      )) as { data: Array<Record<string, unknown>> };

      const createdObservation = result.data.find(
        (item) => item.id === observation.id,
      );

      expect(createdObservation?.input).toBe("visible input");
      expect(createdObservation?.output).toBe("visible output");
      expect(createdObservation?.metadata).toEqual({ customer: "acme" });
      expect(createdObservation).toHaveProperty("userId");
    });

    it("should filter by advanced filters", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const traceId = randomUUID();
      const matchingUserId = `mcp-filter-user-${nanoid()}`;

      await createEventsCh([
        createObservationEvent({
          projectId,
          traceId,
          userId: matchingUserId,
        }),
        createObservationEvent({
          projectId,
          traceId,
          userId: `mcp-filter-user-miss-${nanoid()}`,
        }),
      ]);

      const result = (await handleListObservations(
        {
          traceId,
          filter: [
            {
              type: "string",
              column: "userId",
              operator: "=",
              value: matchingUserId,
            },
          ],
          fields: ["id", "userId"],
          limit: 100,
        },
        context,
      )) as { data: Array<{ id: string; userId: string | null }> };

      expect(result.data).toEqual([
        { userId: matchingUserId, id: expect.any(String) },
      ]);
    });

    it("should match advanced input filters beyond the events_core truncation boundary", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const traceId = randomUUID();
      const needle = `needle-${nanoid()}`;
      const matchingObservation = createObservationEvent({
        projectId,
        traceId,
        input: `${"x".repeat(250)}${needle}`,
      });

      await createEventsCh([
        matchingObservation,
        createObservationEvent({
          projectId,
          traceId,
          input: "short-input-without-match",
        }),
      ]);

      const result = (await handleListObservations(
        {
          traceId,
          filter: [
            {
              type: "string",
              column: "input",
              operator: "contains",
              value: needle,
            },
          ],
          fields: ["id"],
          limit: 100,
        },
        context,
      )) as { data: Array<{ id: string }> };

      expect(result.data).toEqual([{ id: matchingObservation.id }]);
    });

    it("should require selective scope for full io and metadata access", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleListObservations({ fields: ["input"], limit: 100 }, context),
      ).rejects.toThrow(
        /requires traceId, an id filter, or both fromStartTime and toStartTime/i,
      );

      await expect(
        handleListObservations(
          {
            fields: ["id"],
            filter: [
              {
                type: "string",
                column: "input",
                operator: "contains",
                value: "secret",
              },
            ],
            limit: 100,
          },
          context,
        ),
      ).rejects.toThrow(
        /requires traceId, an id filter, or both fromStartTime and toStartTime/i,
      );

      await expect(
        handleListObservations(
          {
            fields: ["input"],
            filter: [
              {
                type: "stringOptions",
                column: "id",
                operator: "any of",
                value: [randomUUID()],
              },
            ],
            limit: 100,
          },
          context,
        ),
      ).resolves.toMatchObject({ data: [] });

      await expect(
        handleListObservations(
          {
            fields: ["metadata"],
            fromStartTime: "2026-01-01T00:00:00.000Z",
            toStartTime: "2026-01-02T00:00:00.000Z",
            limit: 100,
          },
          context,
        ),
      ).resolves.toMatchObject({ data: [] });
    });

    it("should infer advanced filter type from the column", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const traceId = randomUUID();
      const matchingObservation = createObservationEvent({
        projectId,
        traceId,
        name: `mcp-filter-infer-match-${nanoid()}`,
        totalCost: 0.003,
      });

      await createEventsCh([
        matchingObservation,
        createObservationEvent({
          projectId,
          traceId,
          name: `mcp-filter-infer-miss-${nanoid()}`,
          totalCost: 0.001,
        }),
      ]);

      const result = (await handleListObservations(
        {
          traceId,
          filter: [
            { column: "totalCost", operator: ">", value: 0.0029 } as any,
          ],
          fields: ["id", "name"],
          limit: 100,
        },
        context,
      )) as { data: Array<{ id: string; name: string }> };

      expect(result.data).toEqual([
        { id: matchingObservation.id, name: matchingObservation.name },
      ]);
    });

    it("should reject explicit advanced filters with a mismatched column type", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleListObservations(
          {
            filter: [
              {
                type: "string",
                column: "totalCost",
                operator: "=",
                value: "abc",
              },
            ],
            limit: 100,
          },
          context,
        ),
      ).rejects.toThrow(/Validation failed: filter\.0: Invalid input/i);
    });

    it("should reject hidden/internal advanced filter columns", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleListObservations(
          {
            filter: [
              {
                type: "arrayOptions",
                column: "toolNames",
                operator: "any of",
                value: ["internal-tool"],
              },
            ],
            limit: 100,
          },
          context,
        ),
      ).rejects.toThrow(/getObservationFilterSchema/i);

      await expect(
        handleListObservations(
          {
            filter: [
              {
                type: "stringOptions",
                column: "traceTags",
                operator: "any of",
                value: ["internal-name"],
              },
            ],
            limit: 100,
          },
          context,
        ),
      ).rejects.toThrow(/getObservationFilterSchema/i);
    });

    it("should allow the public tags advanced filter column", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const traceId = randomUUID();
      const matchingTag = `mcp-filter-tag-${nanoid()}`;
      const matchingObservation = createObservationEvent({
        projectId,
        traceId,
        name: `mcp-filter-tag-match-${nanoid()}`,
        tags: [matchingTag],
      });

      await createEventsCh([
        matchingObservation,
        createObservationEvent({
          projectId,
          traceId,
          name: `mcp-filter-tag-miss-${nanoid()}`,
          tags: [`mcp-filter-tag-miss-${nanoid()}`],
        }),
      ]);

      const result = (await handleListObservations(
        {
          traceId,
          filter: [
            {
              type: "arrayOptions",
              column: "tags",
              operator: "any of",
              value: [matchingTag],
            },
          ],
          fields: ["id"],
          limit: 100,
        },
        context,
      )) as { data: Array<{ id: string }> };

      expect(result.data).toEqual([{ id: matchingObservation.id }]);
    });

    it("should return a cursor when more results are available", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const traceId = randomUUID();

      await createEventsCh([
        createObservationEvent({
          projectId,
          traceId,
          name: `mcp-cursor-1-${nanoid()}`,
          startTime: new Date("2026-01-01T00:00:00.000Z"),
        }),
        createObservationEvent({
          projectId,
          traceId,
          name: `mcp-cursor-2-${nanoid()}`,
          startTime: new Date("2026-01-02T00:00:00.000Z"),
        }),
      ]);

      const result = (await handleListObservations(
        { traceId, fields: ["id"], limit: 1 },
        context,
      )) as { data: Array<{ id: string }>; meta: { cursor?: string } };

      expect(result.data).toHaveLength(1);
      expect(result.meta.cursor).toEqual(expect.any(String));
    });

    it("should reject invalid field projections", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleListObservations({ fields: ["*", "id"], limit: 50 }, context),
      ).rejects.toThrow(/mixed wildcard projection/i);

      await expect(
        handleListObservations(
          { fields: ["unknownField"], limit: 50 },
          context,
        ),
      ).rejects.toThrow(/getObservationFieldSchema/i);
    });

    it("should enforce max limit of 100", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleListObservations({ limit: 101 }, context),
      ).rejects.toThrow(/<=100/i);
    });

    it("should use context.projectId for tenant isolation", async () => {
      const { context: context1, projectId: projectId1 } =
        await createMcpTestSetup();
      const { context: context2 } = await createMcpTestSetup();
      const traceId = randomUUID();
      const observation = createObservationEvent({
        projectId: projectId1,
        traceId,
        name: `mcp-list-isolation-${nanoid()}`,
      });

      await createEventsCh([observation]);

      const result1 = (await handleListObservations(
        { traceId, fields: ["id"], limit: 100 },
        context1,
      )) as { data: Array<{ id: string }> };
      const result2 = (await handleListObservations(
        { traceId, fields: ["id"], limit: 100 },
        context2,
      )) as { data: Array<{ id: string }> };

      expect(result1.data.map((item) => item.id)).toContain(observation.id);
      expect(result2.data).toEqual([]);
    });
  });

  maybeEventsTable("queryMetrics tool", () => {
    const metricsWindow = {
      fromTimestamp: "2025-12-31T00:00:00.000Z",
      toTimestamp: "2026-01-02T00:00:00.000Z",
    };

    const getMetricRows = (result: unknown) => {
      expect(result).toMatchObject({ data: expect.any(Array) });
      return Reflect.get(Object(result), "data");
    };

    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(queryMetricsTool, { readOnlyHint: true });
    });

    it("should expose object-shaped metrics query input in the tool schema", () => {
      const properties = queryMetricsTool.inputSchema.properties;

      expect(properties.view).toBeDefined();
      expect(properties.dimensions).toBeDefined();
      expect(properties.metrics).toBeDefined();
      expect(properties.filters).toBeDefined();
      expect(properties.timeDimension).toBeDefined();
      expect(properties.fromTimestamp).toBeDefined();
      expect(properties.toTimestamp).toBeDefined();
      expect(properties.orderBy).toBeDefined();
      expect(properties.config).toBeDefined();
    });

    it("should query observations metrics for the current project", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const traceId = randomUUID();

      await createEventsCh(
        Array.from({ length: 3 }, (_, index) =>
          createObservationEvent({
            projectId,
            traceId,
            name: `mcp-metrics-count-${index}-${nanoid()}`,
            startTime: new Date(`2026-01-01T00:00:0${index}.000Z`),
          }),
        ),
      );

      const rows = getMetricRows(
        await handleQueryMetrics(
          {
            view: "observations",
            metrics: [{ measure: "count", aggregation: "count" }],
            filters: [
              {
                type: "string",
                column: "traceId",
                operator: "=",
                value: traceId,
              },
            ],
            ...metricsWindow,
          },
          context,
        ),
      );

      expect(rows).toHaveLength(1);
      expect(Number(rows[0].count_count)).toBe(3);
    });

    it("should apply default row_limit of 100 when omitted", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const traceId = randomUUID();

      await createEventsCh(
        Array.from({ length: 150 }, (_, index) =>
          createObservationEvent({
            projectId,
            traceId,
            name: `mcp-metrics-default-limit-${index}-${nanoid()}`,
            startTime: new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + index * 1000),
          }),
        ),
      );

      const rows = getMetricRows(
        await handleQueryMetrics(
          {
            view: "observations",
            dimensions: [{ field: "name" }],
            metrics: [{ measure: "count", aggregation: "count" }],
            filters: [
              {
                type: "string",
                column: "traceId",
                operator: "=",
                value: traceId,
              },
            ],
            ...metricsWindow,
          },
          context,
        ),
      );

      expect(rows.length).toBeLessThanOrEqual(100);
    });

    it("should respect explicit row_limit", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const traceId = randomUUID();

      await createEventsCh(
        Array.from({ length: 20 }, (_, index) =>
          createObservationEvent({
            projectId,
            traceId,
            name: `mcp-metrics-custom-limit-${index}-${nanoid()}`,
            startTime: new Date(`2026-01-01T00:00:${index}.000Z`),
          }),
        ),
      );

      const rows = getMetricRows(
        await handleQueryMetrics(
          {
            view: "observations",
            dimensions: [{ field: "name" }],
            metrics: [{ measure: "count", aggregation: "count" }],
            filters: [
              {
                type: "string",
                column: "traceId",
                operator: "=",
                value: traceId,
              },
            ],
            config: { row_limit: 5 },
            ...metricsWindow,
          },
          context,
        ),
      );

      expect(rows.length).toBeLessThanOrEqual(5);
    });

    it("should validate high-cardinality queries before applying default row_limit", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleQueryMetrics(
          {
            view: "observations",
            dimensions: [{ field: "traceId" }],
            metrics: [{ measure: "count", aggregation: "count" }],
            orderBy: [{ field: "count_count", direction: "desc" }],
            ...metricsWindow,
          },
          context,
        ),
      ).rejects.toThrow(
        /require both 'config\.row_limit' and 'orderBy' with direction 'desc'/i,
      );
    });
  });

  maybeEventsTable("getMetricsSchema tool", () => {
    const getMetricsSchemaViews = (result: unknown) => {
      expect(result).toMatchObject({ views: expect.any(Object) });
      return Reflect.get(Object(result), "views");
    };

    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(getMetricsSchemaTool, { readOnlyHint: true });
    });

    it("should return v2 metrics schema metadata", async () => {
      const { context } = await createMcpTestSetup();

      const result = await handleGetMetricsSchema({}, context);
      const views = getMetricsSchemaViews(result);

      expect(result).toMatchObject({
        supportedViews: [
          "observations",
          "scores-numeric",
          "scores-categorical",
        ],
        granularities: expect.arrayContaining(["day"]),
        config: {
          row_limit: { min: 1, max: 1000, default: 100 },
          bins: { min: 1, max: 100 },
        },
        views: {
          observations: {
            dimensions: {
              traceId: { highCardinality: true },
            },
            measures: {
              count: {
                validAggregations: expect.arrayContaining(["count"]),
              },
            },
          },
        },
      });
      expect(Reflect.get(Object(views), "traces")).toBeUndefined();
    });

    it("should return one requested metrics view", async () => {
      const { context } = await createMcpTestSetup();

      const result = await handleGetMetricsSchema(
        { view: "scores-numeric" },
        context,
      );
      const views = getMetricsSchemaViews(result);

      expect(Object.keys(views)).toEqual(["scores-numeric"]);
    });
  });

  maybeEventsTable("getObservation tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(getObservationTool, { readOnlyHint: true });
    });

    it("should be available to in-app agent keys", async () => {
      const context = mockServerContext({ isInAppAgentKey: true });

      await expect(
        toolRegistry.getEnabledTool(getObservationTool.name, context),
      ).resolves.toBeDefined();
    });

    it("should fetch a single observation by id with compact default projection", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const observation = createObservationEvent({
        projectId,
        name: `mcp-get-default-${nanoid()}`,
        input: "hidden input",
      });

      await createEventsCh([observation]);

      const result = (await handleGetObservation(
        { observationId: observation.id },
        context,
      )) as Record<string, unknown>;

      expect(result).toMatchObject({
        id: observation.id,
        traceId: observation.trace_id,
        name: observation.name,
        type: "GENERATION",
        providedModelName: "gpt-4o-mini",
      });
      expect(result.input).toBeUndefined();
      expect(result.output).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });

    it("should fetch an observation with an in-app agent context", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const observation = createObservationEvent({
        projectId,
        name: `mcp-get-in-app-agent-${nanoid()}`,
      });

      await createEventsCh([observation]);

      const result = (await handleGetObservation(
        { observationId: observation.id, fields: ["id"] },
        { ...context, isInAppAgentKey: true },
      )) as Record<string, unknown>;

      expect(result).toEqual({ id: observation.id });
    });

    it("should return requested fields for a single observation", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const observation = createObservationEvent({
        projectId,
        name: `mcp-get-fields-${nanoid()}`,
        metadata: { customer: "acme" },
      });

      await createEventsCh([observation]);

      const result = (await handleGetObservation(
        { observationId: observation.id, fields: ["id", "metadata"] },
        context,
      )) as Record<string, unknown>;

      expect(result).toEqual({
        id: observation.id,
        metadata: { customer: "acme" },
      });
    });

    it("should reject missing observations", async () => {
      const { context } = await createMcpTestSetup();
      const observationId = randomUUID();

      await expect(
        handleGetObservation({ observationId }, context),
      ).rejects.toThrow(new RegExp(`Observation ${observationId} not found`));
    });

    it("should not fetch cross-project observations", async () => {
      const { projectId: projectId1 } = await createMcpTestSetup();
      const { context: context2 } = await createMcpTestSetup();
      const observation = createObservationEvent({
        projectId: projectId1,
        name: `mcp-get-isolation-${nanoid()}`,
      });

      await createEventsCh([observation]);

      await expect(
        handleGetObservation({ observationId: observation.id }, context2),
      ).rejects.toThrow(/not found/i);
    });
  });

  maybeEventsTable("getObservationFilterValues tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(getObservationFilterValuesTool, {
        readOnlyHint: true,
      });
    });

    it("should be available to in-app agent keys", async () => {
      const context = mockServerContext({ isInAppAgentKey: true });

      await expect(
        toolRegistry.getEnabledTool(
          getObservationFilterValuesTool.name,
          context,
        ),
      ).resolves.toBeDefined();
    });

    it("should return values for a dynamic filter column", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const uniqueModel = `mcp-model-${nanoid()}`;

      await createEventsCh([
        createObservationEvent({
          projectId,
          name: `mcp-filter-values-${nanoid()}`,
          providedModelName: uniqueModel,
        }),
        createObservationEvent({
          projectId,
          name: `mcp-filter-values-${nanoid()}`,
          providedModelName: uniqueModel,
        }),
      ]);

      const result = (await handleGetObservationFilterValues(
        { column: "providedModelName", limit: 100 },
        context,
      )) as {
        column: string;
        values: Array<{ value: string; count?: number }>;
        meta: Record<string, unknown>;
      };

      expect(result.column).toBe("providedModelName");
      expect(result.values).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ value: uniqueModel, count: 2 }),
        ]),
      );
      expect(result.meta).toBeDefined();
    });

    it("should map public tags column to traceTags option source", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const uniqueTag = `mcp-tag-${nanoid()}`;

      await createEventsCh([
        createObservationEvent({
          projectId,
          name: `mcp-filter-tags-${nanoid()}`,
          tags: [uniqueTag],
        }),
      ]);

      const result = (await handleGetObservationFilterValues(
        { column: "tags", limit: 100 },
        context,
      )) as { column: string; values: Array<{ value: string }> };

      expect(result.column).toBe("tags");
      expect(result.values).toEqual(
        expect.arrayContaining([expect.objectContaining({ value: uniqueTag })]),
      );
    });

    it("should return boolean values for hasParentObservation with counts", async () => {
      const { context, projectId } = await createMcpTestSetup();

      await createEventsCh([
        createObservationEvent({
          projectId,
          name: `mcp-filter-has-parent-${nanoid()}`,
          parentObservationId: randomUUID(),
        }),
        createObservationEvent({
          projectId,
          name: `mcp-filter-root-${nanoid()}`,
          parentObservationId: null,
        }),
      ]);

      const result = (await handleGetObservationFilterValues(
        { column: "hasParentObservation", limit: 100 },
        context,
      )) as {
        column: string;
        values: Array<{ value: boolean; count?: number }>;
      };

      expect(result.column).toBe("hasParentObservation");
      expect(result.values).toEqual([
        expect.objectContaining({ value: false, count: 1 }),
        expect.objectContaining({ value: true, count: 1 }),
      ]);
    });

    it("should preserve backend order and paginate filter values with an opaque cursor", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const topName = `mcp-filter-page-top-${nanoid()}`;
      const nextName = `mcp-filter-page-next-${nanoid()}`;
      const lastName = `mcp-filter-page-last-${nanoid()}`;

      await createEventsCh([
        createObservationEvent({ projectId, name: topName }),
        createObservationEvent({ projectId, name: topName }),
        createObservationEvent({ projectId, name: topName }),
        createObservationEvent({ projectId, name: nextName }),
        createObservationEvent({ projectId, name: nextName }),
        createObservationEvent({ projectId, name: lastName }),
      ]);

      const firstPage = (await handleGetObservationFilterValues(
        { column: "name", limit: 2 },
        context,
      )) as {
        values: Array<{ value: string; count?: number }>;
        meta: { cursor?: string };
      };

      expect(firstPage.values).toEqual([
        { value: topName, count: 3 },
        { value: nextName, count: 2 },
      ]);
      expect(firstPage.meta.cursor).toEqual(expect.any(String));

      const secondPage = (await handleGetObservationFilterValues(
        { column: "name", limit: 2, cursor: firstPage.meta.cursor },
        context,
      )) as {
        values: Array<{ value: string; count?: number }>;
      };

      expect(secondPage.values).toEqual([{ value: lastName, count: 1 }]);
    });

    it("should reject invalid cursors and unavailable columns", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleGetObservationFilterValues(
          { column: "name", limit: 100, cursor: "not-base64-json" },
          context,
        ),
      ).rejects.toThrow(/invalid cursor format/i);

      await expect(
        handleGetObservationFilterValues(
          { column: "input", limit: 100 } as any,
          context,
        ),
      ).rejects.toThrow(/validation failed/i);
    });
  });

  describe("listScores tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(listScoresTool, { readOnlyHint: true });
    });

    it("should return paginated scores with object-shaped filters", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const matchingScore = createTraceScore({
        project_id: projectId,
        id: randomUUID(),
        name: `mcp-score-${nanoid()}`,
        data_type: "NUMERIC",
        value: 0.9,
      });
      const otherScore = createTraceScore({
        project_id: projectId,
        id: randomUUID(),
        name: `mcp-score-${nanoid()}`,
        data_type: "BOOLEAN",
        value: 1,
        string_value: "True",
      });

      await createScoresCh([matchingScore, otherScore]);

      const result = (await handleListScores(
        {
          limit: 10,
          page: 1,
          scoreIds: [matchingScore.id, otherScore.id],
          dataType: "NUMERIC",
          fields: ["score"],
        },
        context,
      )) as any;
      const data = result.data;

      expect(Object.keys(result).sort()).toEqual(["data", "meta"]);
      expect(result.meta).toMatchObject({
        page: 1,
        limit: 10,
        totalItems: 1,
      });
      expect(data).toHaveLength(1);
      expect(data).toEqual([
        expect.objectContaining({
          id: matchingScore.id,
          dataType: "NUMERIC",
        }),
      ]);
      expect(data).toEqual([
        expect.not.objectContaining({ trace: expect.anything() }),
      ]);
    });

    it("should enforce public v2 score field validation", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleListScores({ fields: ["trace"], limit: 10, page: 1 }, context),
      ).rejects.toThrow(/Scores needs to be selected always/i);

      await expect(
        handleListScores(
          { fields: ["score"], userId: "user-1", limit: 10, page: 1 },
          context,
        ),
      ).rejects.toThrow(/Cannot filter by trace properties/i);

      await expect(
        handleListScores(
          { fields: ["score"], traceTags: [], limit: 10, page: 1 },
          context,
        ),
      ).resolves.toMatchObject({ data: [] });
    });
  });

  describe("getScore tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(getScoreTool, { readOnlyHint: true });
    });

    it("should fetch a score by id", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const score = createTraceScore({
        project_id: projectId,
        id: randomUUID(),
        name: `mcp-get-score-${nanoid()}`,
        data_type: "NUMERIC",
        value: 0.8,
      });

      await createScoresCh([score]);

      const result = await handleGetScore({ scoreId: score.id }, context);

      expect(result).toMatchObject({
        id: score.id,
        name: score.name,
        dataType: "NUMERIC",
        value: 0.8,
      });
    });

    it("should reject missing and cross-project scores", async () => {
      const { projectId } = await createMcpTestSetup();
      const { context: otherContext } = await createMcpTestSetup();
      const score = createTraceScore({
        project_id: projectId,
        id: randomUUID(),
      });

      await createScoresCh([score]);

      await expect(
        handleGetScore({ scoreId: randomUUID() }, otherContext),
      ).rejects.toThrow(/Score not found/i);
      await expect(
        handleGetScore({ scoreId: score.id }, otherContext),
      ).rejects.toThrow(/Score not found/i);
    });
  });

  describe("createScore tool", () => {
    it("should have destructiveHint annotation", () => {
      verifyToolAnnotations(createScoreTool, { destructiveHint: true });
    });

    it("should create a score using v1 route semantics", async () => {
      const { context } = await createMcpTestSetup();
      const scoreId = randomUUID();

      const result = await handleCreateScore(
        {
          id: scoreId,
          traceId: randomUUID(),
          name: `mcp-create-score-${nanoid(8)}`,
          value: 1,
          dataType: "NUMERIC",
          environment: "default",
          source: "API",
        },
        context,
      );

      expect(result).toEqual({ id: scoreId });
    });
  });

  describe("listScoreConfigs tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(listScoreConfigsTool, { readOnlyHint: true });
    });

    it("should return paginated score configs for the current project", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const { context: otherContext, projectId: otherProjectId } =
        await createMcpTestSetup();
      const name = `mcp-config-${nanoid()}`;

      await prisma.scoreConfig.createMany({
        data: [
          {
            id: randomUUID(),
            projectId,
            name,
            dataType: ScoreConfigDataType.NUMERIC,
            minValue: 0,
            maxValue: 1,
          },
          {
            id: randomUUID(),
            projectId: otherProjectId,
            name,
            dataType: ScoreConfigDataType.NUMERIC,
            minValue: 0,
            maxValue: 1,
          },
        ],
      });

      const result = (await handleListScoreConfigs(
        { limit: 10, page: 1 },
        context,
      )) as any;
      const otherResult = (await handleListScoreConfigs(
        { limit: 10, page: 1 },
        otherContext,
      )) as any;

      expect(Object.keys(result).sort()).toEqual(["data", "meta"]);
      expect(result.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ projectId, name })]),
      );
      expect(result.data).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ projectId: otherProjectId, name }),
        ]),
      );
      expect(otherResult.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ projectId: otherProjectId, name }),
        ]),
      );
    });

    it("should paginate score configs deterministically when createdAt timestamps tie", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const sharedCreatedAt = new Date("2100-05-12T00:00:00.000Z");
      const configIDs = [randomUUID(), randomUUID(), randomUUID()];

      await prisma.scoreConfig.createMany({
        data: configIDs.map((id, index) => ({
          id,
          projectId,
          name: `mcp-tie-score-config-${index}-${id.slice(0, 8)}`,
          dataType: ScoreConfigDataType.NUMERIC,
          minValue: index,
          maxValue: index + 1,
          createdAt: sharedCreatedAt,
          updatedAt: sharedCreatedAt,
        })),
      });

      const firstPage = (await handleListScoreConfigs(
        { limit: 2, page: 1 },
        context,
      )) as any;
      const secondPage = (await handleListScoreConfigs(
        { limit: 2, page: 2 },
        context,
      )) as any;

      const tiedIDs = [...firstPage.data, ...secondPage.data]
        .filter((config) => config.id && configIDs.includes(config.id))
        .map((config) => config.id);

      expect(tiedIDs).toEqual(configIDs.slice().sort());
      expect(new Set(tiedIDs).size).toBe(configIDs.length);
    });
  });

  describe("getScoreConfig tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(getScoreConfigTool, { readOnlyHint: true });
    });

    it("should fetch a score config by id", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const config = await prisma.scoreConfig.create({
        data: {
          id: randomUUID(),
          projectId,
          name: `mcp-get-${nanoid(8)}`,
          dataType: ScoreConfigDataType.BOOLEAN,
          categories: [
            { label: "True", value: 1 },
            { label: "False", value: 0 },
          ],
        },
      });

      const result = await handleGetScoreConfig(
        { configId: config.id },
        context,
      );

      expect(result).toMatchObject({
        id: config.id,
        name: config.name,
        dataType: ScoreConfigDataType.BOOLEAN,
      });
    });

    it("should reject missing and cross-project score configs", async () => {
      const { projectId } = await createMcpTestSetup();
      const { context: otherContext } = await createMcpTestSetup();
      const config = await prisma.scoreConfig.create({
        data: {
          id: randomUUID(),
          projectId,
          name: `mcp-cross-${nanoid(8)}`,
          dataType: ScoreConfigDataType.TEXT,
        },
      });

      await expect(
        handleGetScoreConfig({ configId: randomUUID() }, otherContext),
      ).rejects.toThrow(/Score config not found/i);
      await expect(
        handleGetScoreConfig({ configId: config.id }, otherContext),
      ).rejects.toThrow(/Score config not found/i);
    });
  });

  describe("createScoreConfig tool", () => {
    it("should have destructiveHint annotation", () => {
      verifyToolAnnotations(createScoreConfigTool, { destructiveHint: true });
    });

    it("should describe allowed score config name characters in the input schema", () => {
      expect(
        containsStringValue(
          createScoreConfigTool.inputSchema,
          "Allowed characters: letters, numbers, spaces, underscores, periods, parentheses, and hyphens.",
        ),
      ).toBe(true);
    });

    it.each([
      [
        "numeric",
        {
          name: `mcp-num-${nanoid(8)}`,
          dataType: "NUMERIC" as const,
          minValue: 0,
          maxValue: 1,
        },
      ],
      [
        "categorical",
        {
          name: `mcp-cat-${nanoid(8)}`,
          dataType: "CATEGORICAL" as const,
          categories: [
            { label: "High", value: 1 },
            { label: "Low", value: 0 },
          ],
        },
      ],
      [
        "text",
        {
          name: `mcp-text-${nanoid(8)}`,
          dataType: "TEXT" as const,
          categories: undefined,
        },
      ],
    ])("should create %s score configs", async (_type, input) => {
      const { context, projectId, apiKeyId } = await createMcpTestSetup();

      const result = (await handleCreateScoreConfig(input, context)) as any;

      expect(result).toMatchObject({
        projectId,
        name: input.name,
        dataType: input.dataType,
      });

      await expect(
        verifyAuditLog({
          projectId,
          resourceType: "scoreConfig",
          resourceId: result.id,
          action: "create",
          apiKeyId,
        }),
      ).resolves.toMatchObject({ action: "create" });
    });

    it("should create boolean configs with inferred categories", async () => {
      const { context } = await createMcpTestSetup();

      const result = await handleCreateScoreConfig(
        {
          name: `mcp-bool-${nanoid(8)}`,
          dataType: "BOOLEAN",
          categories: undefined,
        },
        context,
      );

      expect(result).toMatchObject({
        dataType: ScoreConfigDataType.BOOLEAN,
        categories: [
          { label: "True", value: 1 },
          { label: "False", value: 0 },
        ],
      });
    });

    it("should reject invalid categories", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleCreateScoreConfig(
          {
            name: `mcp-invalid-${nanoid(8)}`,
            dataType: "CATEGORICAL",
            categories: [
              { label: "Duplicate", value: 1 },
              { label: "Duplicate", value: 2 },
            ],
          },
          context,
        ),
      ).rejects.toThrow(/Category labels must be unique/i);
    });
  });

  describe("updateScoreConfig tool", () => {
    it("should have destructiveHint annotation", () => {
      verifyToolAnnotations(updateScoreConfigTool, { destructiveHint: true });
    });

    it("should describe allowed score config name characters in the input schema", () => {
      expect(
        containsStringValue(
          updateScoreConfigTool.inputSchema,
          "Allowed characters: letters, numbers, spaces, underscores, periods, parentheses, and hyphens.",
        ),
      ).toBe(true);
    });

    it("should not expose archive state in the input schema", () => {
      expect(
        containsPropertyName(updateScoreConfigTool.inputSchema, "isArchived"),
      ).toBe(false);
    });

    it("should update allowed fields and write an audit log", async () => {
      const { context, projectId, apiKeyId } = await createMcpTestSetup();
      const config = await prisma.scoreConfig.create({
        data: {
          id: randomUUID(),
          projectId,
          name: `mcp-update-${nanoid(8)}`,
          dataType: ScoreConfigDataType.NUMERIC,
          minValue: 0,
          maxValue: 1,
        },
      });

      const result = await handleUpdateScoreConfig(
        {
          configId: config.id,
          name: "mcp-updated",
          description: "Updated through MCP",
          minValue: -1,
        },
        context,
      );

      expect(result).toMatchObject({
        id: config.id,
        name: "mcp-updated",
        description: "Updated through MCP",
        minValue: -1,
      });

      await expect(
        verifyAuditLog({
          projectId,
          resourceType: "scoreConfig",
          resourceId: config.id,
          action: "update",
          apiKeyId,
        }),
      ).resolves.toMatchObject({ action: "update" });
    });

    it("should reject empty update bodies", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleUpdateScoreConfig({ configId: randomUUID() }, context),
      ).rejects.toThrow(/Request body cannot be empty/i);
    });

    it("should not archive score configs through update", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const config = await prisma.scoreConfig.create({
        data: {
          id: randomUUID(),
          projectId,
          name: `mcp-update-no-archive-${nanoid(8)}`,
          dataType: ScoreConfigDataType.NUMERIC,
          minValue: 0,
          maxValue: 1,
        },
      });

      const result = await handleUpdateScoreConfig(
        {
          configId: config.id,
          name: "mcp-still-active",
          isArchived: true,
        } as unknown as Parameters<typeof handleUpdateScoreConfig>[0],
        context,
      );

      expect(result).toMatchObject({
        id: config.id,
        name: "mcp-still-active",
        isArchived: false,
      });
    });
  });

  describe("deleteScoreConfig tool", () => {
    it("should have destructiveHint annotation", () => {
      verifyToolAnnotations(deleteScoreConfigTool, { destructiveHint: true });
    });

    it("should archive the score config", async () => {
      const { context, projectId, apiKeyId } = await createMcpTestSetup();
      const config = await prisma.scoreConfig.create({
        data: {
          id: randomUUID(),
          projectId,
          name: `mcp-delete-config-${nanoid(8)}`,
          dataType: ScoreConfigDataType.NUMERIC,
          minValue: 0,
          maxValue: 1,
        },
      });

      const result = await handleDeleteScoreConfig(
        { configId: config.id },
        context,
      );

      expect(result).toMatchObject({
        id: config.id,
        isArchived: true,
      });

      await expect(
        verifyAuditLog({
          projectId,
          resourceType: "scoreConfig",
          resourceId: config.id,
          action: "update",
          apiKeyId,
        }),
      ).resolves.toMatchObject({ action: "update" });
    });
  });

  describe("getPrompt tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(getPromptTool, { readOnlyHint: true });
    });

    it("should be available to in-app agent keys", async () => {
      const context = mockServerContext({ isInAppAgentKey: true });

      await expect(
        toolRegistry.getEnabledTool(getPromptTool.name, context),
      ).resolves.toBeDefined();
    });

    it("should fetch prompt by name only (defaults to production label)", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      // Create a prompt with production label
      await createPromptInDb({
        name: promptName,
        prompt: "You are a helpful assistant.",
        projectId,
        labels: ["production"],
        version: 1,
      });

      const result = (await handleGetPrompt({ name: promptName }, context)) as {
        name: string;
        version: number;
        labels: string[];
      };

      expect(result.name).toBe(promptName);
      expect(result.version).toBe(1);
      expect(result.labels).toContain("production");
    });

    it("should fetch prompt by name and specific label", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      // Create v1 with staging label
      await createPromptInDb({
        name: promptName,
        prompt: "Version 1",
        projectId,
        labels: ["staging"],
        version: 1,
      });

      // Create v2 with production label
      await createPromptInDb({
        name: promptName,
        prompt: "Version 2",
        projectId,
        labels: ["production"],
        version: 2,
      });

      const result = (await handleGetPrompt(
        { name: promptName, label: "staging" },
        context,
      )) as { version: number; prompt: string };

      expect(result.version).toBe(1);
      expect(result.prompt).toBe("Version 1");
    });

    it("should fetch prompt by name and specific version", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Version 1",
        projectId,
        version: 1,
      });

      await createPromptInDb({
        name: promptName,
        prompt: "Version 2",
        projectId,
        version: 2,
      });

      const result = (await handleGetPrompt(
        { name: promptName, version: 2 },
        context,
      )) as { version: number; prompt: string };

      expect(result.version).toBe(2);
      expect(result.prompt).toBe("Version 2");
    });

    it("should throw error when both label and version are specified", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
      });

      // The input schema refinement should reject this
      await expect(
        handleGetPrompt(
          { name: promptName, label: "production", version: 1 },
          context,
        ),
      ).rejects.toThrow();
    });

    it("should return error for non-existent prompt", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleGetPrompt({ name: "non-existent-prompt" }, context),
      ).rejects.toThrow(/not found/i);
    });

    it("should return error for non-existent label", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        labels: ["staging"],
      });

      await expect(
        handleGetPrompt({ name: promptName, label: "production" }, context),
      ).rejects.toThrow(/not found/i);
    });

    it("should return error for non-existent version", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        version: 1,
      });

      await expect(
        handleGetPrompt({ name: promptName, version: 999 }, context),
      ).rejects.toThrow(/not found/i);
    });

    it("should use context.projectId for tenant isolation", async () => {
      const { context: context1, projectId: projectId1 } =
        await createMcpTestSetup();
      const { context: context2, projectId: projectId2 } =
        await createMcpTestSetup();

      const promptName = `shared-name-${nanoid()}`;

      // Create same-named prompt in both projects
      await createPromptInDb({
        name: promptName,
        prompt: "Project 1 content",
        projectId: projectId1,
        labels: ["production"],
      });

      await createPromptInDb({
        name: promptName,
        prompt: "Project 2 content",
        projectId: projectId2,
        labels: ["production"],
      });

      // Each context should only see its own project's prompt
      const result1 = (await handleGetPrompt(
        { name: promptName },
        context1,
      )) as { prompt: string };
      expect(result1.prompt).toBe("Project 1 content");

      const result2 = (await handleGetPrompt(
        { name: promptName },
        context2,
      )) as { prompt: string };
      expect(result2.prompt).toBe("Project 2 content");
    });

    it("should handle special characters in prompt name", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-special!@#$%${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Special chars test",
        projectId,
        labels: ["production"],
      });

      const result = (await handleGetPrompt({ name: promptName }, context)) as {
        name: string;
      };
      expect(result.name).toBe(promptName);
    });

    it("should include prompt config in response", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        labels: ["production"],
        config: { model: "gpt-4", temperature: 0.7 },
      });

      const result = (await handleGetPrompt({ name: promptName }, context)) as {
        config: Record<string, unknown>;
      };

      expect(result.config).toEqual({ model: "gpt-4", temperature: 0.7 });
    });

    it("should include tags in response", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        labels: ["production"],
        tags: ["experimental", "v2"],
      });

      const result = (await handleGetPrompt({ name: promptName }, context)) as {
        tags: string[];
      };

      expect(result.tags).toEqual(["experimental", "v2"]);
    });
  });

  describe("listPrompts tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(listPromptsTool, { readOnlyHint: true });
    });

    it("should be available to in-app agent keys", async () => {
      const context = mockServerContext({ isInAppAgentKey: true });

      await expect(
        toolRegistry.getEnabledTool(listPromptsTool.name, context),
      ).resolves.toBeDefined();
    });

    it("should list all prompts for project", async () => {
      const { context, projectId } = await createMcpTestSetup();

      // Create multiple prompts
      const prompt1Name = `list-test-1-${nanoid()}`;
      const prompt2Name = `list-test-2-${nanoid()}`;

      await createPromptInDb({
        name: prompt1Name,
        prompt: "First prompt",
        projectId,
      });

      await createPromptInDb({
        name: prompt2Name,
        prompt: "Second prompt",
        projectId,
      });

      const result = (await handleListPrompts(
        { page: 1, limit: 100 },
        context,
      )) as {
        data: Array<{ name: string }>;
        meta: { totalItems: number };
      };

      // Should include our prompts (may include others from setup)
      const names = result.data.map((p) => p.name);
      expect(names).toContain(prompt1Name);
      expect(names).toContain(prompt2Name);
      expect(result.meta.totalItems).toBeGreaterThanOrEqual(2);
      expect(Object.keys(result).sort()).toEqual(["data", "meta"]);
    });

    it("should filter by name", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const uniquePrefix = `filter-name-${nanoid()}`;

      await createPromptInDb({
        name: `${uniquePrefix}-match`,
        prompt: "Match",
        projectId,
      });

      await createPromptInDb({
        name: `other-${nanoid()}`,
        prompt: "No match",
        projectId,
      });

      const result = (await handleListPrompts(
        { name: `${uniquePrefix}-match`, page: 1, limit: 100 },
        context,
      )) as {
        data: Array<{ name: string }>;
      };

      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe(`${uniquePrefix}-match`);
    });

    it("should filter by label", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `filter-label-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Production version",
        projectId,
        labels: ["production"],
        version: 1,
      });

      await createPromptInDb({
        name: `other-${nanoid()}`,
        prompt: "Staging version",
        projectId,
        labels: ["staging"],
        version: 1,
      });

      const result = (await handleListPrompts(
        { label: "production", page: 1, limit: 100 },
        context,
      )) as {
        data: Array<{ name: string; labels: string[] }>;
      };

      // All returned prompts should have production label
      for (const prompt of result.data) {
        expect(prompt.labels).toContain("production");
      }
    });

    it("should filter by tag", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `filter-tag-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Tagged prompt",
        projectId,
        tags: ["experimental"],
      });

      await createPromptInDb({
        name: `untagged-${nanoid()}`,
        prompt: "Untagged prompt",
        projectId,
        tags: [],
      });

      const result = (await handleListPrompts(
        { tag: "experimental", page: 1, limit: 100 },
        context,
      )) as {
        data: Array<{ name: string; tags: string[] }>;
      };

      // Should only return prompts with experimental tag
      expect(result.data.length).toBeGreaterThan(0);
      for (const prompt of result.data) {
        expect(prompt.tags).toContain("experimental");
      }
    });

    it("should filter by fromUpdatedAt", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const oldPrompt = `filter-from-updated-${nanoid()}`;
      const newPrompt = `filter-from-updated-${nanoid()}`;

      const oldDate = new Date("2026-01-01T00:00:00.000Z");
      const newDate = new Date("2026-02-01T00:00:00.000Z");

      await prisma.prompt.create({
        data: {
          name: oldPrompt,
          prompt: "old",
          labels: [],
          tags: [],
          type: "text",
          version: 1,
          config: {},
          createdBy: "test-user",
          createdAt: oldDate,
          updatedAt: oldDate,
          project: { connect: { id: projectId } },
        },
      });

      await prisma.prompt.create({
        data: {
          name: newPrompt,
          prompt: "new",
          labels: [],
          tags: [],
          type: "text",
          version: 1,
          config: {},
          createdBy: "test-user",
          createdAt: newDate,
          updatedAt: newDate,
          project: { connect: { id: projectId } },
        },
      });

      const result = (await handleListPrompts(
        {
          fromUpdatedAt: "2026-01-15T00:00:00.000Z",
          page: 1,
          limit: 100,
        },
        context,
      )) as { data: Array<{ name: string }> };

      const names = result.data.map((p) => p.name);
      expect(names).toContain(newPrompt);
      expect(names).not.toContain(oldPrompt);
    });

    it("should filter by toUpdatedAt", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const oldPrompt = `filter-to-updated-${nanoid()}`;
      const newPrompt = `filter-to-updated-${nanoid()}`;

      const oldDate = new Date("2026-01-01T00:00:00.000Z");
      const newDate = new Date("2026-02-01T00:00:00.000Z");

      await prisma.prompt.create({
        data: {
          name: oldPrompt,
          prompt: "old",
          labels: [],
          tags: [],
          type: "text",
          version: 1,
          config: {},
          createdBy: "test-user",
          createdAt: oldDate,
          updatedAt: oldDate,
          project: { connect: { id: projectId } },
        },
      });

      await prisma.prompt.create({
        data: {
          name: newPrompt,
          prompt: "new",
          labels: [],
          tags: [],
          type: "text",
          version: 1,
          config: {},
          createdBy: "test-user",
          createdAt: newDate,
          updatedAt: newDate,
          project: { connect: { id: projectId } },
        },
      });

      const result = (await handleListPrompts(
        {
          toUpdatedAt: "2026-01-15T00:00:00.000Z",
          page: 1,
          limit: 100,
        },
        context,
      )) as { data: Array<{ name: string }> };

      const names = result.data.map((p) => p.name);
      expect(names).toContain(oldPrompt);
      expect(names).not.toContain(newPrompt);
    });

    it("should return error when fromUpdatedAt is after toUpdatedAt", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleListPrompts(
          {
            fromUpdatedAt: "2026-02-02T00:00:00.000Z",
            toUpdatedAt: "2026-02-01T00:00:00.000Z",
            page: 1,
            limit: 50,
          },
          context,
        ),
      ).rejects.toThrow(/fromUpdatedAt.*<=.*toUpdatedAt/i);
    });

    it("should handle pagination with page and limit", async () => {
      const { context, projectId } = await createMcpTestSetup();

      // Create enough prompts to test pagination
      for (let i = 0; i < 5; i++) {
        await createPromptInDb({
          name: `pagination-test-${i}-${nanoid()}`,
          prompt: `Prompt ${i}`,
          projectId,
        });
      }

      const result = (await handleListPrompts(
        { page: 1, limit: 2 },
        context,
      )) as {
        data: Array<{ name: string }>;
        meta: { page: number; limit: number; totalPages: number };
      };

      expect(result.data.length).toBeLessThanOrEqual(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(2);
      expect(result.meta.totalPages).toBeGreaterThanOrEqual(1);
    });

    it("should return empty results for no matches", async () => {
      const { context } = await createMcpTestSetup();

      const result = (await handleListPrompts(
        { name: `non-existent-${nanoid()}`, page: 1, limit: 100 },
        context,
      )) as {
        data: Array<unknown>;
        meta: { totalItems: number };
      };

      expect(result.data).toEqual([]);
      expect(result.meta.totalItems).toBe(0);
    });

    it("should use context.projectId for tenant isolation", async () => {
      const { context: context1, projectId: projectId1 } =
        await createMcpTestSetup();
      const { context: context2 } = await createMcpTestSetup();

      const uniqueName = `isolation-test-${nanoid()}`;

      // Create prompt only in project 1
      await createPromptInDb({
        name: uniqueName,
        prompt: "Project 1 only",
        projectId: projectId1,
      });

      // Project 1 should see it
      const result1 = (await handleListPrompts(
        { name: uniqueName, page: 1, limit: 100 },
        context1,
      )) as { data: Array<unknown> };
      expect(result1.data.length).toBe(1);

      // Project 2 should not see it
      const result2 = (await handleListPrompts(
        { name: uniqueName, page: 1, limit: 100 },
        context2,
      )) as { data: Array<unknown> };
      expect(result2.data.length).toBe(0);
    });

    it("should respect default pagination values", async () => {
      const { context } = await createMcpTestSetup();

      const result = (await handleListPrompts(
        { page: 1, limit: 100 },
        context,
      )) as {
        meta: { page: number; limit: number };
      };

      // Default values from validation schema
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBeLessThanOrEqual(100); // Max limit
    });

    it("should include prompt metadata in list results", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `metadata-test-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        labels: ["production"],
        tags: ["important"],
        version: 1,
      });

      const result = (await handleListPrompts(
        { name: promptName, page: 1, limit: 100 },
        context,
      )) as {
        data: Array<{
          name: string;
          version: number;
          labels: string[];
          tags: string[];
        }>;
      };

      expect(result.data[0].name).toBe(promptName);
      expect(result.data[0].labels).toContain("production");
      expect(result.data[0].tags).toContain("important");
    });
  });

  describe("getPromptUnresolved tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(getPromptUnresolvedTool, { readOnlyHint: true });
    });

    it("should be available to in-app agent keys", async () => {
      const context = mockServerContext({ isInAppAgentKey: true });

      await expect(
        toolRegistry.getEnabledTool(getPromptUnresolvedTool.name, context),
      ).resolves.toBeDefined();
    });

    it("should fetch prompt without resolving dependencies (by name only)", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-unresolved-${nanoid()}`;

      // Create a prompt with dependency tags (unresolved)
      const rawPromptContent =
        "You are a helpful assistant. @@@langfusePrompt:name=base-instructions|label=production@@@";

      await createPromptInDb({
        name: promptName,
        prompt: rawPromptContent,
        projectId,
        labels: ["production"],
        version: 1,
      });

      const result = (await handleGetPromptUnresolved(
        { name: promptName },
        context,
      )) as {
        name: string;
        version: number;
        prompt: string;
        labels: string[];
      };

      expect(result.name).toBe(promptName);
      expect(result.version).toBe(1);
      expect(result.labels).toContain("production");
      // Verify dependency tags are NOT resolved
      expect(result.prompt).toBe(rawPromptContent);
      expect(result.prompt).toContain(
        "@@@langfusePrompt:name=base-instructions|label=production@@@",
      );
    });

    it("should fetch prompt by name and specific label without resolution", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-unresolved-${nanoid()}`;

      // Create v1 with staging label
      await createPromptInDb({
        name: promptName,
        prompt: "Version 1 @@@langfusePrompt:name=helper|label=staging@@@",
        projectId,
        labels: ["staging"],
        version: 1,
      });

      // Create v2 with production label
      await createPromptInDb({
        name: promptName,
        prompt: "Version 2 @@@langfusePrompt:name=helper|label=production@@@",
        projectId,
        labels: ["production"],
        version: 2,
      });

      const result = (await handleGetPromptUnresolved(
        { name: promptName, label: "staging" },
        context,
      )) as { version: number; prompt: string };

      expect(result.version).toBe(1);
      expect(result.prompt).toBe(
        "Version 1 @@@langfusePrompt:name=helper|label=staging@@@",
      );
    });

    it("should fetch prompt by name and specific version without resolution", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-unresolved-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "V1 content @@@langfusePrompt:name=dep|label=v1@@@",
        projectId,
        labels: ["staging"],
        version: 1,
      });

      await createPromptInDb({
        name: promptName,
        prompt: "V2 content @@@langfusePrompt:name=dep|label=v2@@@",
        projectId,
        labels: ["production"],
        version: 2,
      });

      const result = (await handleGetPromptUnresolved(
        { name: promptName, version: 1 },
        context,
      )) as { version: number; prompt: string };

      expect(result.version).toBe(1);
      expect(result.prompt).toBe(
        "V1 content @@@langfusePrompt:name=dep|label=v1@@@",
      );
    });

    it("should throw error if prompt not found", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleGetPromptUnresolved(
          { name: "non-existent-prompt-12345" },
          context,
        ),
      ).rejects.toThrow("Prompt 'non-existent-prompt-12345' not found");
    });

    it("should throw error when both label and version are specified", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleGetPromptUnresolved(
          { name: "test", label: "production", version: 1 },
          context,
        ),
      ).rejects.toThrow(
        "Cannot specify both label and version - they are mutually exclusive",
      );
    });

    it("should return raw chat prompt without resolving dependencies", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-chat-unresolved-${nanoid()}`;

      const chatMessages = [
        {
          role: "system",
          content:
            "You are helpful @@@langfusePrompt:name=system-base|label=production@@@",
        },
        {
          role: "user",
          content: "@@@langfusePrompt:name=user-template|label=production@@@",
        },
      ];

      await createPromptInDb({
        name: promptName,
        prompt: chatMessages,
        projectId,
        labels: ["production"],
        version: 1,
        type: "chat",
      });

      const result = (await handleGetPromptUnresolved(
        { name: promptName },
        context,
      )) as {
        name: string;
        type: string;
        prompt: Array<{ role: string; content: string }>;
      };

      expect(result.type).toBe("chat");
      expect(result.prompt).toEqual(chatMessages);
      expect(result.prompt[0].content).toContain(
        "@@@langfusePrompt:name=system-base|label=production@@@",
      );
    });
  });
});
