/**
 * MCP Tool Definition Helper
 *
 * Standardized helper for defining MCP tools with automatic error handling.
 * Following Sentry pattern of consistent tool configuration.
 */

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { z } from "zod/v4";
import { zodToJsonSchema } from "zod-to-json-schema";
import { wrapErrorHandling } from "./error-formatting";
import type { ServerContext } from "../types";

/**
 * Tool handler function type
 */
export type ToolHandler<TInput> = (
  input: TInput,
  context: ServerContext,
) => Promise<unknown>;

/**
 * Tool definition options
 */
export interface DefineToolOptions<TInput> {
  /** Tool name (must be unique across all tools) */
  name: string;

  /** Description for LLM to understand when to use this tool */
  description: string;

  /** Zod schema for validating input parameters */
  inputSchema: z.ZodType<TInput>;

  /** Handler function that executes the tool logic */
  handler: ToolHandler<TInput>;

  /**
   * Hint: This tool only reads data, does not modify anything
   * Helps LLM understand tool capabilities
   */
  readOnlyHint?: boolean;

  /**
   * Hint: This tool has destructive effects (delete, overwrite)
   * Helps LLM be more cautious when using this tool
   */
  destructiveHint?: boolean;

  /**
   * Hint: This tool is expensive to run (slow, rate-limited)
   * Helps LLM avoid unnecessary calls
   */
  expensiveHint?: boolean;
}

/**
 * MCP Tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  annotations?: {
    readOnly?: boolean;
    destructive?: boolean;
    expensive?: boolean;
  };
}

/**
 * Define an MCP tool with standardized configuration and error handling.
 *
 * Features:
 * - Automatic input validation with Zod
 * - Automatic error handling and formatting
 * - JSON Schema generation from Zod schema
 * - Tool annotations for LLM hints
 *
 * @param options Tool configuration options
 * @returns Tuple of [tool definition, wrapped handler]
 *
 * @example
 * const [toolDef, handler] = defineTool({
 *   name: "getPrompt",
 *   description: "Fetch a prompt by name",
 *   inputSchema: z.object({
 *     name: ParamPromptName,
 *     version: ParamPromptVersion,
 *   }),
 *   handler: async (input, context) => {
 *     // Implementation
 *   },
 *   readOnlyHint: true,
 * });
 */
export function defineTool<TInput>(
  options: DefineToolOptions<TInput>,
): [ToolDefinition, ToolHandler<TInput>] {
  const {
    name,
    description,
    inputSchema,
    handler,
    readOnlyHint,
    destructiveHint,
    expensiveHint,
  } = options;

  // Convert Zod schema to JSON Schema for MCP
  // Note: Cast to any is necessary because zodToJsonSchema returns JsonSchema7
  // which isn't directly compatible with MCP's tool schema type.
  // The cast back to ToolDefinition['inputSchema'] is safe because:
  // 1. We use $refStrategy: "none" to avoid $ref usage
  // 2. MCP expects JSON Schema Draft 7 compatible object schemas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonSchema = zodToJsonSchema(inputSchema as any, {
    name: `${name}Input`,
    $refStrategy: "none",
  });

  // Build tool definition
  const toolDefinition: ToolDefinition = {
    name,
    description,
    inputSchema: jsonSchema as ToolDefinition["inputSchema"],
  };

  // Add annotations if provided
  if (readOnlyHint || destructiveHint || expensiveHint) {
    toolDefinition.annotations = {
      readOnly: readOnlyHint,
      destructive: destructiveHint,
      expensive: expensiveHint,
    };
  }

  // Wrap handler with validation and error handling
  const wrappedHandler: ToolHandler<TInput> = wrapErrorHandling(
    async (rawInput: unknown, context: ServerContext) => {
      // Validate input with Zod schema
      const validatedInput = inputSchema.parse(rawInput);

      // Call the actual handler with validated input
      return await handler(validatedInput, context);
    },
  );

  return [toolDefinition, wrappedHandler];
}
