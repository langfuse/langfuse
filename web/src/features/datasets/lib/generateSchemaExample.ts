import jsf from "json-schema-faker";
import type { Prisma } from "@langfuse/shared";

/**
 * Generate an example object from a JSON Schema using json-schema-faker
 * @param schema - JSON Schema to generate example from
 * @returns Formatted JSON string of the generated example, or empty string on error
 */
export function generateSchemaExample(schema: Prisma.JsonValue): string {
  try {
    if (!schema || typeof schema !== "object") {
      console.error("Invalid schema: must be an object", schema);

      return "";
    }
    jsf.option({
      alwaysFakeOptionals: true,
      useDefaultValue: true,
      useExamplesValue: true,
    });

    const generated = jsf.generate(schema);

    return JSON.stringify(generated, null, 2);
  } catch (error) {
    console.error("Failed to generate schema example:", error);

    return "";
  }
}
