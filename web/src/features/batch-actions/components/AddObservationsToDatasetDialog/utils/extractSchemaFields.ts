/**
 * Utility to extract fields from a JSON Schema for pre-populating key-value mapping.
 *
 * Extracts top-level and nested object properties with dot notation paths.
 * Handles common JSON Schema patterns but intentionally limits complexity.
 */

export type SchemaField = {
  /** Dot notation path, e.g., "context.user_id" */
  path: string;
  /** JSON Schema type: "string", "number", "object", "array", etc. */
  type: string;
  /** Whether this field is required */
  required: boolean;
  /** Description from schema, if available */
  description?: string;
};

type JSONSchemaObject = {
  type?: string | string[];
  properties?: Record<string, JSONSchemaObject>;
  required?: string[];
  items?: JSONSchemaObject;
  description?: string;
  anyOf?: JSONSchemaObject[];
  oneOf?: JSONSchemaObject[];
  allOf?: JSONSchemaObject[];
  $ref?: string;
};

/**
 * Extract fields from a JSON Schema for use in key-value mapping.
 *
 * @param schema - The JSON Schema to extract fields from
 * @param maxDepth - Maximum nesting depth to traverse (default: 3)
 * @returns Array of schema fields with paths, types, and required status
 *
 * @example
 * const schema = {
 *   type: "object",
 *   required: ["prompt"],
 *   properties: {
 *     prompt: { type: "string" },
 *     context: {
 *       type: "object",
 *       properties: {
 *         user_id: { type: "string" }
 *       }
 *     }
 *   }
 * };
 *
 * extractSchemaFields(schema);
 * // Returns:
 * // [
 * //   { path: "prompt", type: "string", required: true },
 * //   { path: "context", type: "object", required: false },
 * //   { path: "context.user_id", type: "string", required: false }
 * // ]
 */
export function extractSchemaFields(
  schema: unknown,
  maxDepth: number = 3,
): SchemaField[] {
  if (!isJsonSchemaObject(schema)) {
    return [];
  }

  // Only extract from object-type schemas
  const schemaType = getSchemaType(schema);
  if (schemaType !== "object") {
    return [];
  }

  const fields: SchemaField[] = [];
  extractFieldsRecursive({
    schema,
    prefix: "",
    requiredSet: new Set(schema.required ?? []),
    fields,
    depth: 0,
    maxDepth,
  });

  return fields;
}

/**
 * Check if the schema is an object type (key-value mapping makes sense).
 */
export function isObjectSchema(schema: unknown): boolean {
  if (!isJsonSchemaObject(schema)) {
    return false;
  }
  return getSchemaType(schema) === "object";
}

// --- Internal helpers ---

function isJsonSchemaObject(value: unknown): value is JSONSchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSchemaType(schema: JSONSchemaObject): string | undefined {
  if (typeof schema.type === "string") {
    return schema.type;
  }
  if (Array.isArray(schema.type) && schema.type.length > 0) {
    // Return first non-null type
    return schema.type.find((t) => t !== "null") ?? schema.type[0];
  }
  // Infer object type if properties exist
  if (schema.properties) {
    return "object";
  }
  return undefined;
}

function extractFieldsRecursive(params: {
  schema: JSONSchemaObject;
  prefix: string;
  requiredSet: Set<string>;
  fields: SchemaField[];
  depth: number;
  maxDepth: number;
}): void {
  const { schema, prefix, requiredSet, fields, depth, maxDepth } = params;

  if (depth >= maxDepth) {
    return;
  }

  const properties = schema.properties;
  if (!properties) {
    return;
  }

  for (const [key, propSchema] of Object.entries(properties)) {
    if (!isJsonSchemaObject(propSchema)) {
      continue;
    }

    const path = prefix ? `${prefix}.${key}` : key;
    const propType = getSchemaType(propSchema) ?? "unknown";
    const isRequired = requiredSet.has(key);

    // Add this field
    fields.push({
      path,
      type: propType,
      required: isRequired,
      description: propSchema.description,
    });

    // Recurse into nested objects (but not arrays - those are complex)
    if (propType === "object" && propSchema.properties) {
      extractFieldsRecursive({
        schema: propSchema,
        prefix: path,
        requiredSet: new Set(propSchema.required ?? []),
        fields,
        depth: depth + 1,
        maxDepth,
      });
    }
  }
}

/**
 * Generate default key-value entries from schema fields.
 * Only includes required fields and top-level optional fields.
 */
export function generateEntriesFromSchema(
  schemaFields: SchemaField[],
  defaultSourceField: "input" | "output" | "metadata",
): Array<{
  id: string;
  key: string;
  sourceField: "input" | "output" | "metadata";
  value: string;
  fromSchema: boolean;
  isRequired: boolean;
}> {
  // Filter to include:
  // 1. All required fields
  // 2. Top-level optional fields (no dot in path)
  // 3. Skip nested optional fields to avoid clutter
  const fieldsToInclude = schemaFields.filter((field) => {
    if (field.required) return true;
    // Include top-level optional fields
    if (!field.path.includes(".")) return true;
    // Skip deeply nested optional fields
    return false;
  });

  return fieldsToInclude.map((field, index) => ({
    id: `schema-${index}-${field.path}`,
    key: field.path,
    sourceField: defaultSourceField,
    value: "", // User fills this in
    fromSchema: true,
    isRequired: field.required,
  }));
}
