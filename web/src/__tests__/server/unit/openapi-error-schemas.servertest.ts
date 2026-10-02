import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

type OpenApiSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  $ref?: string;
};
type OpenApiResponse = {
  content?: {
    "application/json"?: {
      schema?: OpenApiSchema | Record<string, never>;
    };
  };
};
type OpenApiDocument = {
  paths: Record<
    string,
    Record<string, { responses?: Record<string, OpenApiResponse> }>
  >;
  components: {
    schemas: Record<string, OpenApiSchema>;
  };
};

const openApiPath = path.resolve(
  process.cwd(),
  "public/generated/api/openapi.yml",
);

const ERROR_STATUSES = ["400", "401", "403", "404", "405"] as const;

function parseSpec(source: string): OpenApiDocument {
  return parse(source, { maxAliasCount: -1 }) as OpenApiDocument;
}

describe("generated OpenAPI error schemas", () => {
  const spec = parseSpec(fs.readFileSync(openApiPath, "utf8"));

  it("declares ApiError as { message, error }", () => {
    const apiError = spec.components.schemas.ApiError;

    expect(apiError).toBeDefined();
    expect(apiError.type).toBe("object");
    expect(apiError.properties).toHaveProperty("message");
    expect(apiError.properties).toHaveProperty("error");
    expect(apiError.required).toEqual(
      expect.arrayContaining(["message", "error"]),
    );
    // Must not be the structured PublicApiError contract (message + code).
    expect(apiError.properties).not.toHaveProperty("code");
  });

  it("references ApiError for 400/401/403/404/405 instead of schema: {}", () => {
    let checked = 0;

    for (const methods of Object.values(spec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (method.startsWith("x-") || !operation?.responses) {
          continue;
        }
        for (const status of ERROR_STATUSES) {
          const response = operation.responses[status];
          if (!response) {
            continue;
          }
          const schema = response.content?.["application/json"]?.schema;
          expect(schema).toEqual({
            $ref: "#/components/schemas/ApiError",
          });
          checked += 1;
        }
      }
    }

    expect(checked).toBeGreaterThan(0);
  });
});
