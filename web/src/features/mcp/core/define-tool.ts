/**
 * MCP Tool Definition Helper
 *
 * A Langfuse MCP tool is what `McpServer.registerTool` takes (name,
 * description, input schema, annotations, `_meta`), plus the API action a
 * caller must hold and a `run` function that receives the arguments the SDK
 * already validated against `inputSchema`.
 */

import type { z } from "zod";
import type { McpUiToolMeta } from "@modelcontextprotocol/ext-apps";
import {
  collectAccessRead,
  type AccessAuditMeta,
  type AccessAuditRecorder,
} from "@/src/features/audit-logs/server/auditedQuery";
import { recordMcpAccess } from "@/src/features/audit-logs/server/recordAccessEvent";
import type {
  StandardSchemaWithJSON,
  ToolAnnotations,
  ServerContext as McpRequestContext,
} from "@modelcontextprotocol/server";
import type { ApiAction } from "@/src/features/public-api/server/enforceAuth";
import type { ServerContext } from "../types";

/** Tool handler: validates its input, then runs the tool. */
export type ToolHandler<TInput> = (
  input: TInput,
  context: ServerContext,
  /** The SDK's context of the tools/call request; absent in direct calls. */
  mcpRequest?: McpRequestContext,
) => Promise<unknown>;

type StringKeys<T> = {
  [K in keyof T]-?: T[K] extends string ? K : never;
}[keyof T] &
  string;

/** The read a tool performs, recorded as an audit access event. */
type ToolAccessAudit<TInput> = Omit<AccessAuditMeta, "idKey"> & {
  /** The input field that names the one resource a `read` opens. */
  idKey?: StringKeys<TInput>;
};

/**
 * Tool definition options
 */
export interface DefineToolOptions<TInput, TName extends string = string> {
  /** Tool name (must be unique across all tools) */
  name: TName;

  /** Description for LLM to understand when to use this tool */
  description: string;

  /** Schema without refinements whose JSON Schema clients see in tools/list. */
  baseSchema: z.ZodType<unknown>;

  /** Full schema with refinements that validates tool arguments. */
  inputSchema: z.ZodType<TInput>;

  /** Handler function that executes the tool logic */
  handler: ToolHandler<TInput>;

  /** Action the caller must hold to run this tool. */
  action: ApiAction;

  /**
   * MCP tool annotations (a display title and behavior hints such as
   * `readOnlyHint`), published as given in `tools/list`.
   */
  annotations?: ToolAnnotations;

  /** Renders results with an MCP App UI resource in hosts that support it. */
  ui?: McpUiToolMeta;
}

/** Options of a tool whose reads are recorded as audit access events. */
interface DefineAuditedToolOptions<
  TInput,
  TName extends string = string,
> extends Omit<DefineToolOptions<TInput, TName>, "handler"> {
  /**
   * Records every successful call as an audit access event with
   * `surface = mcp`, the tool name as route and the validated input as
   * params, before the result is returned: a failed write fails the call.
   */
  accessAudit: ToolAccessAudit<TInput>;

  /** Handler that reports what its response contains through `audit`. */
  handler: (
    input: TInput,
    context: ServerContext,
    audit: AccessAuditRecorder,
  ) => Promise<unknown>;
}

/** A tool as registered with `McpServer.registerTool`. */
export interface McpTool<TName extends string = string> {
  name: TName;
  description: string;
  /** Validates arguments and advertises their JSON Schema in `tools/list`. */
  inputSchema: StandardSchemaWithJSON;
  annotations?: ToolAnnotations;
  /** MCP Apps UI resource rendering this tool's results. */
  _meta?: { ui: McpUiToolMeta };
  /** Action the caller must hold to run this tool. */
  action: ApiAction;
  /** Runs the tool on arguments already validated against `inputSchema`. */
  run: (
    input: unknown,
    context: ServerContext,
    mcpRequest?: McpRequestContext,
  ) => Promise<unknown>;
}

type JsonSchemaConverter = StandardSchemaWithJSON["~standard"]["jsonSchema"];
type JsonSchemaOptions = Parameters<JsonSchemaConverter["input"]>[0];

/**
 * Converts a schema to JSON Schema once per direction and options: the SDK
 * asks for it on every `tools/list`, and tool schemas do not change.
 */
const cachedJsonSchema = (
  converter: JsonSchemaConverter,
): JsonSchemaConverter => {
  const cache = new Map<string, Record<string, unknown>>();
  const cached =
    (io: "input" | "output") =>
    (options: JsonSchemaOptions): Record<string, unknown> => {
      const key = `${io}:${JSON.stringify(options)}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const jsonSchema = converter[io](options);
      cache.set(key, jsonSchema);
      return jsonSchema;
    };
  return { input: cached("input"), output: cached("output") };
};

/** Validates with `inputSchema` and advertises the JSON Schema of `baseSchema`. */
const toToolSchema = (
  inputSchema: z.ZodType<unknown>,
  baseSchema: z.ZodType<unknown>,
): StandardSchemaWithJSON => ({
  "~standard": {
    ...inputSchema["~standard"],
    jsonSchema: cachedJsonSchema(baseSchema["~standard"].jsonSchema),
  },
});

function hasJsonSchemaUnion(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;

  if (Array.isArray(value)) {
    return value.some(hasJsonSchemaUnion);
  }

  const schema = value as Record<string, unknown>;

  if (
    Array.isArray(schema.oneOf) ||
    Array.isArray(schema.anyOf) ||
    Array.isArray(schema.allOf)
  ) {
    return true;
  }

  return Object.values(schema).some(hasJsonSchemaUnion);
}

/**
 * Define an MCP tool.
 *
 * @param options Tool configuration options
 * @returns The tool to register, and a handler that validates its input
 * before running the tool (for direct calls).
 *
 * @example
 * const baseSchema = z.object({
 *   name: z.string(),
 *   version: z.number().optional(),
 * });
 *
 * const [getPromptTool, handleGetPrompt] = defineTool({
 *   name: "getPrompt",
 *   description: "Fetch a prompt by name",
 *   baseSchema,
 *   inputSchema: baseSchema.refine(...), // Add runtime validations
 *   action: "prompts:read",
 *   handler: async (input, context) => {
 *     // Implementation
 *   },
 *   annotations: { readOnlyHint: true },
 * });
 */
export function defineTool<TInput, const TName extends string>(
  options: DefineAuditedToolOptions<TInput, TName>,
): [McpTool<TName>, ToolHandler<TInput>];
export function defineTool<TInput, const TName extends string>(
  options: DefineToolOptions<TInput, TName>,
): [McpTool<TName>, ToolHandler<TInput>];
export function defineTool<TInput, const TName extends string>(
  options:
    | DefineAuditedToolOptions<TInput, TName>
    | DefineToolOptions<TInput, TName>,
): [McpTool<TName>, ToolHandler<TInput>] {
  const {
    name,
    description,
    action,
    baseSchema,
    inputSchema,
    annotations,
    ui,
  } = options;

  const schema = toToolSchema(inputSchema, baseSchema);
  const jsonSchema = schema["~standard"].jsonSchema.input({
    target: "draft-2020-12",
  });

  // Some MCP clients reject combinators in tool input schemas.
  if (hasJsonSchemaUnion(jsonSchema)) {
    throw new Error(
      `Failed to convert Zod schema to JSON Schema for tool: ${name}. Union and intersection schemas are not supported for MCP tool inputs; use a plain object schema instead.`,
    );
  }

  if (jsonSchema.type !== "object") {
    throw new Error(
      `Failed to convert Zod schema to JSON Schema for tool: ${name}. Expected object schema, got: ${JSON.stringify(jsonSchema).slice(0, 100)}`,
    );
  }

  const run = async (
    input: unknown,
    context: ServerContext,
    mcpRequest?: McpRequestContext,
  ): Promise<unknown> => {
    const validatedInput = input as TInput;

    if (!("accessAudit" in options)) {
      return await options.handler(validatedInput, context, mcpRequest);
    }

    const { audit, toRead } = collectAccessRead(options.accessAudit);
    const result = await options.handler(validatedInput, context, audit);
    await recordMcpAccess(
      context,
      toRead(name, validatedInput as Record<string, unknown>),
    );
    return result;
  };

  const tool: McpTool<TName> = {
    name,
    description,
    inputSchema: schema,
    ...(annotations ? { annotations } : {}),
    ...(ui ? { _meta: { ui } } : {}),
    action,
    run,
  };

  const handler: ToolHandler<TInput> = async (input, context, mcpRequest) =>
    run(await inputSchema.parseAsync(input), context, mcpRequest);

  return [tool, handler];
}
