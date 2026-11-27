/**
 * MCP Tool Definition Helper
 *
 * Simplified helper for defining MCP tools with automatic JSON Schema generation.
 * Handles the conversion from Zod schemas to JSON Schema for MCP compatibility.
 */

import { z } from "zod";
import {
  collectAccessRead,
  type AccessAuditMeta,
  type AccessAuditRecorder,
} from "@/src/features/audit-logs/server/auditedQuery";
import { recordMcpAccess } from "@/src/features/audit-logs/server/recordAccessEvent";
import type {
  Tool,
  ToolAnnotations,
  ServerContext as McpRequestContext,
} from "@modelcontextprotocol/server";
import type { ApiAction } from "@/src/features/public-api/server/enforceAuth";
import type { McpConnection, ServerContext } from "../types";
import {
  isProjectAction,
  PROJECT_ID_ARGUMENT,
  projectIdArgumentDescription,
} from "../server/toolContext";
import { toMcpAppToolMeta, type McpAppToolUi } from "./mcp-app";

/**
 * Tool handler function type. Project tools get the call's resolved
 * ServerContext; tools that skip authz (getHealth, listProjects) run on the
 * bare McpConnection.
 */
export type ToolHandler<
  TInput,
  TContext extends McpConnection = ServerContext,
> = (
  input: TInput,
  context: TContext,
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
export interface DefineToolOptions<
  TInput,
  TName extends string = string,
  TContext extends McpConnection = ServerContext,
> {
  /** Tool name (must be unique across all tools) */
  name: TName;

  /** Description for LLM to understand when to use this tool */
  description: string;

  /** Base Zod schema (without refinements) - used only for JSON Schema generation */
  baseSchema: z.ZodType<unknown>;

  /** Full Zod schema with refinements - used for runtime validation */
  inputSchema: z.ZodType<TInput>;

  /** Handler function that executes the tool logic */
  handler: ToolHandler<TInput, TContext>;

  /** Action the caller must hold to run this tool. */
  action: ApiAction;

  /**
   * MCP tool annotations (a display title and behavior hints such as
   * `readOnlyHint`), published as given in `tools/list`.
   */
  annotations?: ToolAnnotations;

  /** Renders results with an MCP App UI resource in hosts that support it. */
  ui?: McpAppToolUi;
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

/**
 * MCP Tool definition
 */
export interface ToolDefinition<TName extends string = string> {
  name: TName;
  description: string;
  action: ApiAction;
  inputSchema: Tool["inputSchema"];
  annotations?: ToolAnnotations;
  _meta?: ReturnType<typeof toMcpAppToolMeta>;
}

type JsonSchemaObject = Record<string, unknown>;

function isObjectJsonSchema(
  schema: JsonSchemaObject,
): schema is Tool["inputSchema"] {
  return schema.type === "object";
}

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
export function defineTool<TInput, const TName extends string>(
  options: DefineAuditedToolOptions<TInput, TName>,
): [ToolDefinition<TName>, ToolHandler<TInput>];
export function defineTool<
  TInput,
  const TName extends string,
  TContext extends McpConnection = ServerContext,
>(
  options: DefineToolOptions<TInput, TName, TContext>,
): [ToolDefinition<TName>, ToolHandler<TInput, TContext>];
export function defineTool<TInput, const TName extends string>(
  options:
    | DefineAuditedToolOptions<TInput, TName>
    | DefineToolOptions<TInput, TName, McpConnection>,
): [ToolDefinition<TName>, ToolHandler<TInput, any>] {
  const {
    name,
    description,
    action,
    baseSchema,
    inputSchema,
    annotations,
    ui,
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

  if (hasJsonSchemaUnion(jsonSchema)) {
    throw new Error(
      `Failed to convert Zod schema to JSON Schema for tool: ${name}. Union and intersection schemas are not supported for MCP tool inputs; use a plain object schema instead.`,
    );
  }

  const jsonSchemaObject = jsonSchema as JsonSchemaObject;

  // Validate that we got a usable plain object schema.
  if (!isObjectJsonSchema(jsonSchemaObject)) {
    throw new Error(
      `Failed to convert Zod schema to JSON Schema for tool: ${name}. Expected object schema, got: ${JSON.stringify(jsonSchema).slice(0, 100)}`,
    );
  }

  // Build tool definition
  const toolDefinition: ToolDefinition<TName> = {
    name,
    description,
    action,
    inputSchema: isProjectAction(action)
      ? withProjectIdArgument(name, jsonSchemaObject)
      : jsonSchemaObject,
    ...(annotations ? { annotations } : {}),
    ...(ui ? { _meta: toMcpAppToolMeta(ui) } : {}),
  };

  const wrappedHandler: ToolHandler<TInput, any> = async (
    rawInput: unknown,
    context: McpConnection,
    mcpRequest?: McpRequestContext,
  ) => {
    // Validate input with the full schema (including refinements)
    const validatedInput = inputSchema.parse(rawInput);

    if (!("accessAudit" in options)) {
      return await options.handler(validatedInput, context, mcpRequest);
    }

    // Audited tools always read a project, so they get a ServerContext.
    const projectContext = context as ServerContext;
    const { audit, toRead } = collectAccessRead(options.accessAudit);
    const result = await options.handler(validatedInput, projectContext, audit);
    await recordMcpAccess(
      projectContext,
      toRead(name, validatedInput as Record<string, unknown>),
    );
    return result;
  };

  return [toolDefinition, wrappedHandler];
}

/** withProjectIdArgument adds the optional projectId argument that every project tool accepts; tools/call strips it before the tool validates its input. */
function withProjectIdArgument(
  name: string,
  schema: Tool["inputSchema"],
): Tool["inputSchema"] {
  if (schema.properties && PROJECT_ID_ARGUMENT in schema.properties) {
    throw new Error(
      `MCP tool '${name}' declares a '${PROJECT_ID_ARGUMENT}' input, which is reserved for selecting the project.`,
    );
  }
  return {
    ...schema,
    properties: {
      ...schema.properties,
      [PROJECT_ID_ARGUMENT]: {
        type: "string",
        description: projectIdArgumentDescription,
      },
    },
  };
}
