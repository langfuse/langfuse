import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

type OpenApiProperty = {
  type?: string;
  additionalProperties?: boolean | { $ref: string };
  nullable?: boolean;
  format?: string;
};

type OpenApiSchema = {
  type?: string;
  properties?: Record<string, OpenApiProperty>;
};

type OpenApiDocument = {
  components: {
    schemas: Record<string, OpenApiSchema>;
  };
};

describe("OpenAPI property types", () => {
  const openApiPath = path.resolve(
    process.cwd(),
    "public/generated/api/openapi.yml",
  );
  const openApi = parse(fs.readFileSync(openApiPath, "utf8"), {
    maxAliasCount: -1,
  }) as OpenApiDocument;

  const schemas = openApi.components.schemas;

  it("defines metadata as an object with additionalProperties across core schemas", () => {
    const metadataSchemas = [
      "Trace",
      "Observation",
      "ObservationV2",
      "BaseScore",
      "BaseScoreV1",
      "Dataset",
      "DatasetItem",
      "DatasetRun",
      "CreateScoreRequest",
      "CreateDatasetRequest",
      "CreateDatasetItemRequest",
      "CreateDatasetRunItemRequest",
      "OptionalObservationBody",
      "ObservationBody",
      "TraceBody",
      "ScoreBody",
      "BaseEvent",
    ];

    for (const schemaName of metadataSchemas) {
      const schema = schemas[schemaName];
      expect(schema, `Schema ${schemaName} should exist`).toBeDefined();
      const metadata = schema.properties?.metadata;
      expect(
        metadata,
        `Schema ${schemaName} should have metadata property`,
      ).toBeDefined();
      expect(
        metadata?.type,
        `${schemaName}.metadata should have type: object`,
      ).toBe("object");
      expect(
        metadata?.additionalProperties,
        `${schemaName}.metadata should allow additionalProperties`,
      ).toBe(true);
    }
  });

  it("defines modelParameters as an object with MapValue references on read and write observation schemas", () => {
    const modelParamSchemas = [
      "Observation",
      "ObservationV2",
      "ObservationBody",
      "CreateGenerationBody",
    ];

    for (const schemaName of modelParamSchemas) {
      const schema = schemas[schemaName];
      expect(schema, `Schema ${schemaName} should exist`).toBeDefined();
      const modelParameters = schema.properties?.modelParameters;
      expect(
        modelParameters,
        `Schema ${schemaName} should have modelParameters property`,
      ).toBeDefined();
      expect(
        modelParameters?.type,
        `${schemaName}.modelParameters should have type: object`,
      ).toBe("object");
      expect(
        modelParameters?.additionalProperties,
        `${schemaName}.modelParameters should reference MapValue`,
      ).toEqual({ $ref: "#/components/schemas/MapValue" });
    }
  });

  it("defines config and lastConfig as objects with additionalProperties on prompt schemas", () => {
    expect(schemas.BasePrompt?.properties?.config?.type).toBe("object");
    expect(schemas.BasePrompt?.properties?.config?.additionalProperties).toBe(
      true,
    );

    expect(schemas.CreateChatPromptRequest?.properties?.config?.type).toBe(
      "object",
    );
    expect(
      schemas.CreateChatPromptRequest?.properties?.config?.additionalProperties,
    ).toBe(true);

    expect(schemas.CreateTextPromptRequest?.properties?.config?.type).toBe(
      "object",
    );
    expect(
      schemas.CreateTextPromptRequest?.properties?.config?.additionalProperties,
    ).toBe(true);

    expect(schemas.PromptMeta?.properties?.lastConfig?.type).toBe("object");
    expect(
      schemas.PromptMeta?.properties?.lastConfig?.additionalProperties,
    ).toBe(true);
  });

  it("defines inputSchema and expectedOutputSchema as objects on dataset schemas", () => {
    expect(schemas.Dataset?.properties?.inputSchema?.type).toBe("object");
    expect(schemas.Dataset?.properties?.inputSchema?.additionalProperties).toBe(
      true,
    );
    expect(schemas.Dataset?.properties?.expectedOutputSchema?.type).toBe(
      "object",
    );
    expect(
      schemas.Dataset?.properties?.expectedOutputSchema?.additionalProperties,
    ).toBe(true);

    expect(schemas.CreateDatasetRequest?.properties?.inputSchema?.type).toBe(
      "object",
    );
    expect(
      schemas.CreateDatasetRequest?.properties?.inputSchema
        ?.additionalProperties,
    ).toBe(true);
    expect(
      schemas.CreateDatasetRequest?.properties?.expectedOutputSchema?.type,
    ).toBe("object");
    expect(
      schemas.CreateDatasetRequest?.properties?.expectedOutputSchema
        ?.additionalProperties,
    ).toBe(true);
  });

  it("defines tokenizerConfig as an object on Model and CreateModelRequest", () => {
    expect(schemas.Model?.properties?.tokenizerConfig?.type).toBe("object");
    expect(
      schemas.Model?.properties?.tokenizerConfig?.additionalProperties,
    ).toBe(true);

    expect(schemas.CreateModelRequest?.properties?.tokenizerConfig?.type).toBe(
      "object",
    );
    expect(
      schemas.CreateModelRequest?.properties?.tokenizerConfig
        ?.additionalProperties,
    ).toBe(true);
  });

  it("defines OtelSpan scalar fields and status object", () => {
    const otelSpan = schemas.OtelSpan?.properties;
    expect(otelSpan).toBeDefined();

    expect(otelSpan?.traceId?.type).toBe("string");
    expect(otelSpan?.spanId?.type).toBe("string");
    expect(otelSpan?.parentSpanId?.type).toBe("string");
    expect(otelSpan?.status?.type).toBe("object");
    expect(otelSpan?.status?.additionalProperties).toBe(true);
  });
});
