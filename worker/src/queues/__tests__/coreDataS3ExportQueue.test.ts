import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { type StorageService } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  coreDataTableExports,
  mapDashboardToCoreDataRow,
  mapDashboardWidgetToCoreDataRow,
  mapEvaluationRuleEvaluatorAssignmentToCoreDataRow,
  mapEvaluationRuleToCoreDataRow,
  mapEvaluatorVersionToCoreDataRow,
  mapJobConfigurationToCoreDataRow,
  mapUserToCoreDataRow,
  uploadTableCoreDataJsonl,
} from "../coreDataS3ExportQueue";

const readStream = async (stream: Readable): Promise<string> => {
  const chunks: string[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk.toString());
  }

  return chunks.join("");
};

describe("mapUserToCoreDataRow", () => {
  it("derives auth methods from password and account providers", () => {
    const row = mapUserToCoreDataRow({
      id: "user-1",
      email: "user@example.com",
      password: "hashed-password",
      accounts: [
        { provider: "google" },
        { provider: "okta" },
        { provider: "google" },
      ],
    });

    expect(row).toStrictEqual({
      id: "user-1",
      email: "user@example.com",
      authMethods: ["credentials", "google", "okta"],
    });
    expect(JSON.stringify(row)).not.toContain("hashed-password");
  });

  it("returns no auth methods for users without password and accounts", () => {
    const row = mapUserToCoreDataRow({
      id: "user-2",
      password: null,
      accounts: [],
    });

    expect(row).toStrictEqual({ id: "user-2", authMethods: [] });
  });
});

describe("mapJobConfigurationToCoreDataRow", () => {
  const decimal = (value: number) => ({ toNumber: () => value });

  it("flattens the eval template and casts sampling to a number", () => {
    const row = mapJobConfigurationToCoreDataRow({
      id: "config-1",
      projectId: "project-1",
      scoreName: "toxicity",
      evalTemplateId: "template-1",
      evalTemplate: { name: "toxicity-v2" },
      sampling: decimal(0.5),
    });

    expect(row).toStrictEqual({
      id: "config-1",
      projectId: "project-1",
      scoreName: "toxicity",
      evalTemplateId: "template-1",
      evalTemplateName: "toxicity-v2",
      sampling: 0.5,
      variableMapping: [],
    });
    expect(JSON.stringify(row)).toContain('"sampling":0.5');
  });

  it("exports null for configurations without an eval template", () => {
    const row = mapJobConfigurationToCoreDataRow({
      id: "config-2",
      evalTemplate: null,
      sampling: decimal(1),
    });

    expect(row).toStrictEqual({
      id: "config-2",
      evalTemplateName: null,
      sampling: 1,
      variableMapping: [],
    });
  });

  it("exports null variableMapping as an empty array and keeps arrays", () => {
    const variableMapping = [
      {
        langfuseObject: "trace",
        selectedColumnId: "input",
        templateVariable: "question",
      },
    ];

    expect(
      mapJobConfigurationToCoreDataRow({
        id: "config-3",
        evalTemplate: null,
        sampling: decimal(1),
        variableMapping: null,
      }).variableMapping,
    ).toStrictEqual([]);
    expect(
      mapJobConfigurationToCoreDataRow({
        id: "config-4",
        evalTemplate: null,
        sampling: decimal(1),
        variableMapping,
      }).variableMapping,
    ).toBe(variableMapping);
  });
});

describe("mapEvaluationRuleToCoreDataRow", () => {
  it("casts sampling to a number", () => {
    const row = mapEvaluationRuleToCoreDataRow({
      id: "rule-1",
      projectId: "project-1",
      sampling: { toNumber: () => 0.25 },
    });

    expect(row).toStrictEqual({
      id: "rule-1",
      projectId: "project-1",
      sampling: 0.25,
    });
    expect(JSON.stringify(row)).toContain('"sampling":0.25');
  });
});

describe("mapEvaluatorVersionToCoreDataRow", () => {
  it("exports null variableMapping as an empty array", () => {
    const row = mapEvaluatorVersionToCoreDataRow({
      id: "001a1f0c-45a4-4d4c-b6ef-72bbdd77045e:cmbh3mfmk0082ad072cw2gsuv",
      evaluatorId: "001a1f0c-45a4-4d4c-b6ef-72bbdd77045e",
      version: 3,
      createdByUserId: null,
      partner: null,
      model: null,
      provider: null,
      vars: ["input", "output"],
      variableMapping: null,
      sourceCodeLanguage: null,
      createdAt: "2025-06-03T22:37:06.332Z",
    });

    expect(row.variableMapping).toStrictEqual([]);
    expect(JSON.stringify(row)).toContain('"variableMapping":[]');
    expect(row.vars).toStrictEqual(["input", "output"]);
    expect(row.partner).toBeNull();
  });

  it("keeps an existing variableMapping array", () => {
    const variableMapping = [
      {
        langfuseObject: "trace",
        selectedColumnId: "output",
        templateVariable: "answer",
      },
    ];

    expect(
      mapEvaluatorVersionToCoreDataRow({
        id: "version-1",
        variableMapping,
      }).variableMapping,
    ).toBe(variableMapping);
  });
});

describe("mapEvaluationRuleEvaluatorAssignmentToCoreDataRow", () => {
  it("exports null variableMapping as an empty array", () => {
    const row = mapEvaluationRuleEvaluatorAssignmentToCoreDataRow({
      id: "assignment-1",
      projectId: "project-1",
      evaluationRuleId: "rule-1",
      evaluatorId: "evaluator-1",
      variableMapping: null,
    });

    expect(row.variableMapping).toStrictEqual([]);
    expect(JSON.stringify(row)).toContain('"variableMapping":[]');
  });

  it("keeps an existing variableMapping array", () => {
    const variableMapping = [
      {
        jsonSelector: null,
        selectedColumnId: "input",
        templateVariable: "request",
      },
    ];

    expect(
      mapEvaluationRuleEvaluatorAssignmentToCoreDataRow({
        id: "assignment-2",
        variableMapping,
      }).variableMapping,
    ).toBe(variableMapping);
  });
});

describe("coreDataTableExports", () => {
  it("includes the evaluator v2 tables", async () => {
    const delegates = [
      prisma.project,
      prisma.user,
      prisma.organization,
      prisma.organizationMembership,
      prisma.projectMembership,
      prisma.billingMeterBackup,
      prisma.survey,
      prisma.blobStorageIntegration,
      prisma.posthogIntegration,
      prisma.mixpanelIntegration,
      prisma.ssoConfig,
      prisma.verifiedDomain,
      prisma.prompt,
      prisma.evaluator,
      prisma.evaluatorVersion,
      prisma.evaluationRule,
      prisma.evaluationRuleEvaluatorAssignment,
      prisma.jobConfiguration,
      prisma.dashboard,
      prisma.dashboardWidget,
    ];
    for (const delegate of delegates) {
      vi.spyOn(delegate, "findMany").mockResolvedValue([]);
    }

    const uploadedFiles: string[] = [];
    const s3Client = {
      uploadFileBuffered: vi.fn(
        async ({ fileName, data }: { fileName: string; data: Readable }) => {
          uploadedFiles.push(fileName);
          await readStream(data);
        },
      ),
    } as unknown as StorageService;

    await Promise.all(
      coreDataTableExports.map((exportTable) =>
        exportTable({ s3Client, uploadPrefix: "core/" }),
      ),
    );

    expect(uploadedFiles).toEqual(
      expect.arrayContaining([
        "core/jobConfigurations.jsonl",
        "core/evaluators.jsonl",
        "core/evaluatorVersions.jsonl",
        "core/evaluationRules.jsonl",
        "core/evaluationRuleEvaluatorAssignments.jsonl",
        "core/dashboards.jsonl",
        "core/dashboardWidgets.jsonl",
      ]),
    );

    const selectFor = (findMany: {
      mock: { calls: Array<[{ select?: Record<string, unknown> }?]> };
    }) => findMany.mock.calls[0]?.[0]?.select;

    const evaluatorVersionSelect = selectFor(
      vi.mocked(prisma.evaluatorVersion.findMany),
    );
    expect(evaluatorVersionSelect).toMatchObject({
      id: true,
      evaluatorId: true,
      version: true,
      vars: true,
      variableMapping: true,
    });

    expect(
      selectFor(vi.mocked(prisma.jobConfiguration.findMany)),
    ).not.toHaveProperty("filter");
    expect(
      selectFor(vi.mocked(prisma.jobConfiguration.findMany)),
    ).toMatchObject({ variableMapping: true });
    expect(
      selectFor(vi.mocked(prisma.evaluationRule.findMany)),
    ).not.toHaveProperty("filter");
    expect(
      selectFor(vi.mocked(prisma.evaluationRuleEvaluatorAssignment.findMany)),
    ).toMatchObject({ variableMapping: true });

    const widgetSelect = selectFor(vi.mocked(prisma.dashboardWidget.findMany));
    expect(widgetSelect).not.toHaveProperty("filters");
    expect(widgetSelect).toMatchObject({
      dimensions: true,
      metrics: true,
      chartType: true,
      chartConfig: true,
    });
  });
});

describe("mapDashboardWidgetToCoreDataRow", () => {
  it("allowlists dimensions, metrics, and chart type and drops filters", () => {
    const row = mapDashboardWidgetToCoreDataRow({
      id: "widget-1",
      projectId: "project-1",
      view: "OBSERVATIONS",
      dimensions: [
        { field: "calledToolNames" },
        { field: "customer entered free text" },
      ],
      metrics: [
        { measure: "toolCalls", agg: "sum" },
        { measure: "leaked customer string", agg: "not-an-agg" },
      ],
      filters: [
        {
          column: "userId",
          operator: "any of",
          value: ["customer-user-42"],
          type: "stringOptions",
        },
        {
          column: "metadata",
          key: "customer-secret-key",
          operator: "=",
          value: "customer-value",
          type: "stringObject",
        },
      ],
      chartConfig: {
        type: "PIVOT_TABLE",
        row_limit: 20,
        bins: 8,
        defaultSort: { column: "customer column text", order: "DESC" },
      },
    });

    expect(row).not.toHaveProperty("filters");
    expect(row.dimensions).toStrictEqual([
      { field: "calledToolNames" },
      { field: "__invalid__" },
    ]);
    expect(row.metrics).toStrictEqual([
      { measure: "toolCalls", agg: "sum" },
      { measure: "__invalid__", agg: "__invalid__" },
    ]);
    expect(row.chartConfig).toStrictEqual({
      type: "PIVOT_TABLE",
      row_limit: 20,
      bins: 8,
    });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("customer entered free text");
    expect(serialized).not.toContain("leaked customer string");
    expect(serialized).not.toContain("customer column text");
    expect(serialized).not.toContain("customer-user-42");
    expect(serialized).not.toContain("customer-secret-key");
    expect(serialized).not.toContain("customer-value");
    expect(serialized).not.toContain("userId");
    expect(serialized).not.toContain("stringOptions");
  });

  it("replaces an unknown chartConfig.type with the invalid sentinel", () => {
    const row = mapDashboardWidgetToCoreDataRow({
      id: "widget-3",
      dimensions: [],
      metrics: [],
      chartConfig: { type: "customer free text chart", row_limit: 5 },
    });

    expect(row.chartConfig).toStrictEqual({
      type: "__invalid__",
      row_limit: 5,
      bins: null,
    });
    expect(JSON.stringify(row)).not.toContain("customer free text chart");
  });

  it("normalizes missing dimensions, metrics, and chart config without a filters field", () => {
    const row = mapDashboardWidgetToCoreDataRow({
      id: "widget-2",
      dimensions: null,
      metrics: null,
      filters: null,
      chartConfig: null,
    });

    expect(row).not.toHaveProperty("filters");
    expect(row.dimensions).toStrictEqual([]);
    expect(row.metrics).toStrictEqual([]);
    expect(row.chartConfig).toStrictEqual({
      type: null,
      row_limit: null,
      bins: null,
    });
  });
});

describe("mapDashboardToCoreDataRow", () => {
  it("exports only known placement fields from the definition", () => {
    const row = mapDashboardToCoreDataRow({
      id: "dashboard-1",
      definition: {
        widgets: [
          {
            type: "widget",
            widgetId: "widget-1",
            x: 0,
            y: 0,
            x_size: 6,
            y_size: 4,
            id: "placement-1",
            unexpectedCustomerField: "customer text",
          },
        ],
        unexpectedTopLevel: "more customer text",
      },
    });

    expect(row.definition).toStrictEqual({
      widgets: [
        {
          type: "widget",
          widgetId: "widget-1",
          x: 0,
          y: 0,
          x_size: 6,
          y_size: 4,
        },
      ],
    });
    expect(JSON.stringify(row)).not.toContain("customer text");
  });
});

describe("uploadTableCoreDataJsonl", () => {
  const createS3Client = (
    uploadFileBuffered: ReturnType<typeof vi.fn>,
  ): StorageService => ({ uploadFileBuffered }) as unknown as StorageService;

  it("streams table rows in keyset pages", async () => {
    const createdAt = new Date("2026-05-14T00:00:00.000Z");
    const rows = [
      { id: "row-1", name: "first", createdAt },
      { id: "row-2", name: "second", createdAt },
      { id: "row-3", name: "third", createdAt },
    ];

    const fetchPage = vi.fn(
      async ({ lastRow }: { lastRow: { id: string } | null; take: number }) => {
        if (lastRow === null) return rows.slice(0, 2);
        if (lastRow.id === "row-2") return rows.slice(2);
        return [];
      },
    );

    const uploadFileBuffered = vi.fn(async ({ data }: { data: Readable }) => {
      expect(await readStream(data)).toBe(
        rows.map((row) => JSON.stringify(row)).join("\n"),
      );
    });

    await uploadTableCoreDataJsonl({
      s3Client: createS3Client(uploadFileBuffered),
      uploadPrefix: "core/",
      tableName: "rows",
      pageSize: 2,
      fetchPage,
    });

    // The second page is short, so pagination stops without a third fetch.
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, { lastRow: null, take: 2 });
    expect(fetchPage).toHaveBeenNthCalledWith(2, { lastRow: rows[1], take: 2 });
    expect(uploadFileBuffered).toHaveBeenCalledTimes(1);
    expect(uploadFileBuffered).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "core/rows.jsonl",
        fileType: "application/x-ndjson",
        partSizeBytes: 100 * 1024 * 1024,
      }),
    );
  });

  it("stops after a full page that is followed by an empty page", async () => {
    const rows = [{ id: "row-1" }, { id: "row-2" }];

    const fetchPage = vi.fn(
      async ({ lastRow }: { lastRow: { id: string } | null; take: number }) =>
        lastRow === null ? rows : [],
    );

    const uploadFileBuffered = vi.fn(async ({ data }: { data: Readable }) => {
      expect(await readStream(data)).toBe(
        rows.map((row) => JSON.stringify(row)).join("\n"),
      );
    });

    await uploadTableCoreDataJsonl({
      s3Client: createS3Client(uploadFileBuffered),
      uploadPrefix: "core/",
      tableName: "rows",
      pageSize: 2,
      fetchPage,
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, { lastRow: rows[1], take: 2 });
  });

  it("applies mapRow to every row", async () => {
    const fetchPage = vi.fn(
      async ({ lastRow }: { lastRow: { id: string } | null; take: number }) =>
        lastRow === null
          ? [
              { id: "user-1", password: "secret", accounts: [] },
              {
                id: "user-2",
                password: null,
                accounts: [{ provider: "google" }],
              },
            ]
          : [],
    );

    const uploadFileBuffered = vi.fn(async ({ data }: { data: Readable }) => {
      expect(await readStream(data)).toBe(
        [
          JSON.stringify({ id: "user-1", authMethods: ["credentials"] }),
          JSON.stringify({ id: "user-2", authMethods: ["google"] }),
        ].join("\n"),
      );
    });

    await uploadTableCoreDataJsonl({
      s3Client: createS3Client(uploadFileBuffered),
      uploadPrefix: "core/",
      tableName: "users",
      pageSize: 2,
      fetchPage,
      mapRow: mapUserToCoreDataRow,
    });
  });

  it("uploads an empty file for tables without rows", async () => {
    const fetchPage = vi.fn(async () => []);

    const uploadFileBuffered = vi.fn(async ({ data }: { data: Readable }) => {
      expect(await readStream(data)).toBe("");
    });

    await uploadTableCoreDataJsonl({
      s3Client: createS3Client(uploadFileBuffered),
      uploadPrefix: "core/",
      tableName: "empty",
      fetchPage,
    });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(uploadFileBuffered).toHaveBeenCalledTimes(1);
  });

  it("rethrows upload failures after logging the table context", async () => {
    const fetchPage = vi.fn(
      async ({ lastRow }: { lastRow: { id: string } | null; take: number }) =>
        lastRow === null ? [{ id: "row-1" }] : [],
    );

    const uploadFileBuffered = vi.fn(async () => {
      throw new Error("upload failed");
    });

    await expect(
      uploadTableCoreDataJsonl({
        s3Client: createS3Client(uploadFileBuffered),
        uploadPrefix: "core/",
        tableName: "rows",
        fetchPage,
      }),
    ).rejects.toThrow("upload failed");
  });
});
