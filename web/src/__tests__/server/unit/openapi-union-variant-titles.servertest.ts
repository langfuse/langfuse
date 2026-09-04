import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

import { stampUnionVariantTitles } from "../../../../scripts/openapi/stamp-union-variant-titles";

type Schema = {
  oneOf?: Array<Record<string, unknown>>;
  anyOf?: Array<Record<string, unknown>>;
};
type OpenApiDocument = {
  components: { schemas: Record<string, Schema> };
};

const SPEC = `openapi: 3.0.1
components:
  schemas:
    LlmRequest:
      title: LLMJudgeRequest
      type: object
    CodeRequest:
      type: object
    CreateRequest:
      oneOf:
        - type: object
          allOf:
            - type: object
              properties:
                type:
                  type: string
                  enum: [llm_as_judge]
            - $ref: '#/components/schemas/LlmRequest'
        - type: object
          allOf:
            - type: object
              properties:
                type:
                  type: string
                  enum: [code]
            - $ref: '#/components/schemas/CodeRequest'
    DirectRequest:
      oneOf:
        - $ref: '#/components/schemas/LlmRequest'
        - $ref: '#/components/schemas/CodeRequest'
    Value:
      oneOf:
        - type: number
          format: double
        - type: string
`;

function parseSpec(source: string): OpenApiDocument {
  return parse(source, { maxAliasCount: -1 }) as OpenApiDocument;
}

function titles(source: string, schema: string): unknown[] {
  return (
    parseSpec(source).components.schemas[schema].oneOf?.map(
      (variant) => variant.title,
    ) ?? []
  );
}

function expectAllUnionVariantsNamed(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      expectAllUnionVariantsNamed(item, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  for (const unionKey of ["oneOf", "anyOf"] as const) {
    const union = record[unionKey];
    if (!Array.isArray(union)) continue;

    union.forEach((variant, index) => {
      const branch = variant as Record<string, unknown>;
      const name = branch.title ?? branch.$ref;
      expect(name, `${path}.${unionKey}[${index}]`).toEqual(expect.any(String));
    });
  }

  for (const [key, child] of Object.entries(record)) {
    expectAllUnionVariantsNamed(child, `${path}.${key}`);
  }
}

describe("OpenAPI union variant titles", () => {
  it("gives every union variant in the generated public spec a resolvable name", () => {
    const openApiPath = path.resolve(
      process.cwd(),
      "public/generated/api/openapi.yml",
    );
    const openApi = parseSpec(fs.readFileSync(openApiPath, "utf8"));

    expectAllUnionVariantsNamed(openApi);
  });

  it("names Fern wrappers from referenced schema titles and names", () => {
    const result = stampUnionVariantTitles(SPEC);

    expect(titles(result.source, "CreateRequest")).toEqual([
      "LLMJudgeRequest",
      "CodeRequest",
    ]);
    expect(titles(result.source, "DirectRequest")).toEqual([
      undefined,
      undefined,
    ]);
    expect(result.stamped).toBe(4);
  });

  it("names primitive variants by format and type", () => {
    const result = stampUnionVariantTitles(SPEC);

    expect(titles(result.source, "Value")).toEqual(["DoubleNumber", "String"]);
  });

  it("is idempotent", () => {
    const first = stampUnionVariantTitles(SPEC);
    const second = stampUnionVariantTitles(first.source);

    expect(second.source).toBe(first.source);
    expect(second.stamped).toBe(0);
  });

  it("does not use nested property refs as the variant name", () => {
    const nestedPropertyRef = `openapi: 3.0.1
components:
  schemas:
    Payload:
      type: object
    Value:
      oneOf:
        - type: object
          properties:
            payload:
              $ref: '#/components/schemas/Payload'
        - type: string
`;

    const result = stampUnionVariantTitles(nestedPropertyRef);

    expect(titles(result.source, "Value")).toEqual(["Object", "String"]);
  });

  it("fails when inferred names are ambiguous", () => {
    const ambiguous = `openapi: 3.0.1
components:
  schemas:
    Value:
      oneOf:
        - type: string
        - type: string
`;

    expect(() => stampUnionVariantTitles(ambiguous)).toThrow(
      /Duplicate OpenAPI variant title String/,
    );
  });
});
