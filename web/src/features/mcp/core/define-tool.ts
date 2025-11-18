/**
 * MCP Tool Definition Helper
 *
 * Simplified helper for defining MCP tools with automatic JSON Schema generation.
 * Handles the conversion from Zod schemas to JSON Schema for MCP compatibility.
 */

import { z } from "zod/v4";
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

  /** Base Zod schema (without refinements) - used for JSON Schema generation */
  baseSchema: z.ZodType<TInput>;

  /** Full Zod schema with refinements - used for runtime validation */
  inputSchema: z.ZodType<TInput>;

  /** Handler function that executes the tool logic */
  handler: ToolHandler<TInput>;

  /** Hint: This tool only reads data, does not modify anything */
  readOnlyHint?: boolean;

  /** Hint: This tool has destructive effects (delete, overwrite) */
  destructiveHint?: boolean;

  /** Hint: This tool is expensive to run (slow, rate-limited) */
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
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    expensiveHint?: boolean;
  };
}

/**
 * Define an MCP tool with automatic JSON Schema generation.
 *
 * @param options Tool configuration options
 * @returns Tuple of [tool definition for MCP, wrapped handler for execution]
 *
 * @example
 * const baseSchema = z.object({
 *   name: z.string(),
 *   version: z.number().optional(),
 * });
 *
 * const [toolDef, handler] = defineTool({
 *   name: "getPrompt",
 *   description: "Fetch a prompt by name",
 *   baseSchema,
 *   inputSchema: baseSchema.refine(...), // Add runtime validations
 *   handler: async (input, context) => {
 *     // Implementation
 *   },
 *   readOnly: true,
 * });
 */
export function defineTool<TInput>(
  options: DefineToolOptions<TInput>,
): [ToolDefinition, ToolHandler<TInput>] {
  const {
    name,
    description,
    baseSchema,
    inputSchema,
    handler,
    readOnlyHint,
    destructiveHint,
    expensiveHint,
  } = options;

  // Convert base Zod schema to JSON Schema using Zod v4's native method
  const jsonSchema = z.toJSONSchema(baseSchema, {
    target: "draft-7", // MCP uses JSON Schema draft-7
    unrepresentable: "any", // Fallback for unsupported types
  });

  if (!jsonSchema) {
    throw new Error(
      `Failed to convert Zod schema to JSON Schema for tool: ${name}.`,
    );
  }

  // Validate that we got a usable schema (object or union of objects)
  const hasObjectType = (jsonSchema as { type?: string }).type === "object";
  const hasUnionType =
    "oneOf" in jsonSchema ||
    "anyOf" in jsonSchema ||
    "discriminator" in jsonSchema;
  if (!hasObjectType && !hasUnionType) {
    throw new Error(
      `Failed to convert Zod schema to JSON Schema for tool: ${name}. Expected object or union schema, got: ${JSON.stringify(jsonSchema).slice(0, 100)}`,
    );
  }

  // Build tool definition
  const toolDefinition: ToolDefinition = {
    name,
    description,
    inputSchema: jsonSchema as ToolDefinition["inputSchema"],
  };

  // Add annotations if provided
  if (readOnlyHint || destructiveHint || expensiveHint) {
    toolDefinition.annotations = {
      readOnlyHint,
      destructiveHint,
      expensiveHint,
    };
  }

  // Wrap handler with validation and error handling
  const wrappedHandler: ToolHandler<TInput> = wrapErrorHandling(
    async (rawInput: unknown, context: ServerContext) => {
      // Validate input with the full schema (including refinements)
      const validatedInput = inputSchema.parse(rawInput);
      return await handler(validatedInput, context);
    },
  );

  return [toolDefinition, wrappedHandler];
}
