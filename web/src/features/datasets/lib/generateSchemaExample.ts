import { generateJson, type JsonSchema } from "json-schema-faker";
import type { Prisma } from "@langfuse/shared";

/**
 * Generate an example object from a JSON Schema using json-schema-faker
 * @param schema - JSON Schema to generate example from
 * @returns Formatted JSON string of the generated example, or empty string on error
 */
export async function generateSchemaExample(
  schema: Prisma.JsonValue,
): Promise<string> {
  try {
    if (!schema || typeof schema !== "object") {
      return "";
    }

    return await generateJson(schema as JsonSchema, {
      alwaysFakeOptionals: true,
      useDefaultValue: true,
      useExamplesValue: true,
      pretty: true,
    });
  } catch (error) {
    console.warn("Failed to generate schema example:", error);

    return "";
  }
}
