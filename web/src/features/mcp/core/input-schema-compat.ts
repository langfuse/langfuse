export type JsonSchemaObject = Record<string, unknown>;

type ObjectShape = {
  properties: Record<string, unknown>;
  required: string[];
};

const ROOT_COMPOSITION_KEYWORDS = ["oneOf", "anyOf", "allOf"] as const;
const MAX_SCHEMA_NORMALIZATION_DEPTH = 10;

const isRecord = (value: unknown): value is JsonSchemaObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] | undefined =>
  Array.isArray(value) ? value : undefined;

const withoutDefaults = (
  required: unknown,
  properties: Record<string, unknown>,
) =>
  Array.isArray(required)
    ? required.filter(
        (property): property is string =>
          typeof property === "string" &&
          !(
            isRecord(properties[property]) && "default" in properties[property]
          ),
      )
    : [];

function mergeShapes(
  schemas: unknown[],
  mode: "intersection" | "union",
  depth: number,
): ObjectShape | undefined {
  const shapes = schemas.map((schema) =>
    isRecord(schema) ? collectObjectShape(schema, depth - 1) : undefined,
  );

  if (!shapes.every(Boolean)) {
    return undefined;
  }

  const validShapes = shapes as ObjectShape[];

  return {
    properties: Object.assign(
      {},
      ...validShapes.map((shape) => shape.properties),
    ),
    required:
      mode === "intersection"
        ? [...new Set(validShapes.flatMap((shape) => shape.required))]
        : (validShapes[0]?.required.filter((property) =>
            validShapes.every((shape) => shape.required.includes(property)),
          ) ?? []),
  };
}

function collectObjectShape(
  schema: JsonSchemaObject,
  depth = MAX_SCHEMA_NORMALIZATION_DEPTH,
): ObjectShape | undefined {
  if (depth <= 0) return undefined;

  const allOf = asArray(schema.allOf);
  if (allOf) return mergeShapes(allOf, "intersection", depth);

  const oneOfOrAnyOf = asArray(schema.oneOf) ?? asArray(schema.anyOf);
  if (oneOfOrAnyOf) return mergeShapes(oneOfOrAnyOf, "union", depth);

  if (schema.type !== "object") {
    return undefined;
  }

  const properties = isRecord(schema.properties) ? schema.properties : {};

  return {
    properties,
    required: withoutDefaults(schema.required, properties),
  };
}

export const isObjectLikeJsonSchema = (schema: JsonSchemaObject): boolean =>
  collectObjectShape(schema) !== undefined;

export function normalizeMcpInputSchema(
  schema: JsonSchemaObject,
): JsonSchemaObject {
  if (
    schema.type === "object" &&
    !ROOT_COMPOSITION_KEYWORDS.some((keyword) => keyword in schema)
  ) {
    return schema;
  }

  const shape = collectObjectShape(schema);
  const {
    type: _type,
    properties: _properties,
    required: _required,
    additionalProperties: _additionalProperties,
    oneOf: _oneOf,
    anyOf: _anyOf,
    allOf: _allOf,
    ...metadata
  } = schema;

  return {
    ...metadata,
    type: "object",
    properties: shape?.properties ?? {},
    ...(shape?.required.length ? { required: shape.required } : {}),
  };
}
