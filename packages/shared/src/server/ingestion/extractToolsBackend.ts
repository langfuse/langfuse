import { z } from "zod/v4";
import {
  selectAdapter,
  SimpleChatMlArraySchema,
  type NormalizerContext,
} from "../../utils/chatml";

/**
 * ClickHouse storage schema for tool definitions.
 *
 * Based on ToolDefinitionSchema from packages/shared/src/utils/IORepresentation/chatML/types.ts
 * `parameters` stored as JSON string instead of z.record
 */
export const ClickhouseToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.string().optional(), // JSON string of parameters schema
});
export type ClickhouseToolDefinition = z.infer<
  typeof ClickhouseToolDefinitionSchema
>;

/**
 * ClickHouse storage schema for tool arguments (invocations).
 *
 * Based on ToolCallSchema from packages/shared/src/utils/IORepresentation/chatML/types.ts
 * Adapted for ClickHouse Array(JSON) storage:
 * - `arguments` stored as JSON string (base may have parsed object)
 * - `index` optional field included for parallel tool call ordering
 */
export const ClickhouseToolArgumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.string(), // JSON string of call arguments
  type: z.string().optional(),
  index: z.number().optional(),
});
export type ClickhouseToolArgument = z.infer<
  typeof ClickhouseToolArgumentSchema
>;

/**
 * Flatten tool definition from nested or flat format.
 * Handles both OpenAI Chat Completions {type, function: {name, ...}} and flat {name, ...}.
 */
function flattenToolDefinition(tool: unknown): {
  name?: string;
  description?: string;
  parameters?: unknown;
} {
  if (!tool || typeof tool !== "object") return {};
  const t = tool as Record<string, unknown>;

  // Handle nested {type, function: {name, ...}} format (OpenAI Chat Completions)
  const toolData = (t.function as Record<string, unknown> | undefined) ?? t;

  return {
    name: toolData.name as string | undefined,
    description: (toolData.description ?? toolData.desc) as string | undefined,
    parameters:
      toolData.parameters ??
      toolData.parameters_json_schema ??
      toolData.inputSchema,
  };
}

/**
 * Flatten tool call from nested or flat format.
 * Handles OpenAI {function: {name, arguments}} and flat {name, arguments}.
 */
function flattenToolCall(call: unknown): {
  id?: string;
  name?: string;
  arguments?: string;
  type?: string;
  index?: number;
} {
  if (!call || typeof call !== "object") return {};
  const c = call as Record<string, unknown>;

  // Handle nested {function: {name, arguments}} format
  const func = c.function as Record<string, unknown> | undefined;
  const name = (func?.name ?? c.name ?? c.toolName) as string | undefined;
  const rawArgs = func?.arguments ?? c.arguments ?? c.args;
  const args =
    typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs ?? {});

  return {
    id: (c.id ?? c.toolCallId ?? c.call_id) as string | undefined,
    name,
    arguments: args,
    type: (c.type ?? (func ? "function" : undefined)) as string | undefined,
    index: c.index as number | undefined,
  };
}

/**
 * Helper to add a tool definition, deduplicating by name.
 */
function addToolDefinition(
  definitions: ClickhouseToolDefinition[],
  tool: unknown,
): void {
  const flattened = flattenToolDefinition(tool);
  if (!flattened.name) return; // Skip invalid tools

  const normalized: ClickhouseToolDefinition = {
    name: flattened.name,
    description: flattened.description,
    parameters: flattened.parameters
      ? JSON.stringify(flattened.parameters)
      : undefined,
  };

  // Deduplicate by name
  if (!definitions.some((t) => t.name === normalized.name)) {
    definitions.push(normalized);
  }
}

/**
 * Helper to add a tool call/argument.
 */
function addToolArgument(args: ClickhouseToolArgument[], call: unknown): void {
  const flattened = flattenToolCall(call);
  if (!flattened.name) return; // Skip invalid calls

  args.push({
    id: flattened.id ?? "",
    name: flattened.name,
    arguments: flattened.arguments ?? "{}",
    type: flattened.type,
    index: flattened.index,
  });
}

/**
 * Extract tool definitions from raw input data (top-level tools array).
 */
function extractToolsFromRawInput(
  input: unknown,
  definitions: ClickhouseToolDefinition[],
): void {
  if (!input || typeof input !== "object") return;

  // Handle array of messages or single input object
  const inputObj = Array.isArray(input)
    ? input.find((item) => item && typeof item === "object" && "tools" in item)
    : input;

  if (!inputObj || typeof inputObj !== "object") return;
  const obj = inputObj as Record<string, unknown>;

  // Top-level tools array (OpenAI request format)
  if (Array.isArray(obj.tools)) {
    for (const tool of obj.tools) {
      addToolDefinition(definitions, tool);
    }
  }

  // Messages array with tools
  if (Array.isArray(obj.messages)) {
    for (const msg of obj.messages) {
      if (msg && typeof msg === "object" && Array.isArray(msg.tools)) {
        for (const tool of msg.tools) {
          addToolDefinition(definitions, tool);
        }
      }
    }
  }
}

/**
 * Extract tool calls from raw output data.
 */
function extractToolCallsFromRawOutput(
  output: unknown,
  args: ClickhouseToolArgument[],
): void {
  if (!output) return;

  // Array of messages
  if (Array.isArray(output)) {
    for (const msg of output) {
      if (msg && typeof msg === "object") {
        extractToolCallsFromMessage(msg as Record<string, unknown>, args);
      }
    }
    return;
  }

  if (typeof output !== "object") return;
  const obj = output as Record<string, unknown>;

  // Direct tool_calls at top level
  if (Array.isArray(obj.tool_calls)) {
    for (const call of obj.tool_calls) {
      addToolArgument(args, call);
    }
  }

  // OpenAI choices format: {choices: [{message: {tool_calls: [...]}}]}
  if (Array.isArray(obj.choices)) {
    for (const choice of obj.choices) {
      if (choice && typeof choice === "object") {
        const c = choice as Record<string, unknown>;
        const message = c.message as Record<string, unknown> | undefined;
        if (message && Array.isArray(message.tool_calls)) {
          for (const call of message.tool_calls) {
            addToolArgument(args, call);
          }
        }
      }
    }
  }

  // Anthropic tool_use in content array: {content: [{type: "tool_use", ...}]}
  if (Array.isArray(obj.content)) {
    for (const part of obj.content) {
      if (
        part &&
        typeof part === "object" &&
        (part as Record<string, unknown>).type === "tool_use"
      ) {
        const p = part as Record<string, unknown>;
        addToolArgument(args, {
          id: p.id,
          name: p.name,
          arguments: JSON.stringify(p.input ?? {}),
          type: "tool_use",
        });
      }
    }
  }

  // LangChain additional_kwargs: {additional_kwargs: {tool_calls: [...]}}
  const additionalKwargs = obj.additional_kwargs as
    | Record<string, unknown>
    | undefined;
  if (additionalKwargs && Array.isArray(additionalKwargs.tool_calls)) {
    for (const call of additionalKwargs.tool_calls) {
      addToolArgument(args, call);
    }
  }
}

/**
 * Extract tool calls from a single message object.
 */
function extractToolCallsFromMessage(
  msg: Record<string, unknown>,
  args: ClickhouseToolArgument[],
): void {
  if (Array.isArray(msg.tool_calls)) {
    for (const call of msg.tool_calls) {
      addToolArgument(args, call);
    }
  }

  // Anthropic content array
  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (
        part &&
        typeof part === "object" &&
        (part as Record<string, unknown>).type === "tool_use"
      ) {
        const p = part as Record<string, unknown>;
        addToolArgument(args, {
          id: p.id,
          name: p.name,
          arguments: JSON.stringify(p.input ?? {}),
          type: "tool_use",
        });
      }
    }
  }
}

/**
 * Extract tool definitions and arguments from observation input/output.
 * Uses chatml adapters for consistent parsing across frontend and backend.
 * Also extracts directly from raw formats for robustness.
 * Returns arrays ready for ClickHouse storage.
 * Returns empty arrays if extraction fails or no tools found.
 *
 * @param input - Raw observation input (before stringification)
 * @param output - Raw observation output (before stringification)
 * @param metadata - Optional observation metadata (may contain OTel tool definitions)
 * @returns Object with toolDefinitions and toolArguments arrays
 */
export function extractToolsFromObservation(
  input: unknown,
  output: unknown,
  metadata?: unknown,
): {
  toolDefinitions: ClickhouseToolDefinition[];
  toolArguments: ClickhouseToolArgument[];
} {
  try {
    const ctx: NormalizerContext = { metadata };
    const toolDefinitions: ClickhouseToolDefinition[] = [];
    const toolArguments: ClickhouseToolArgument[] = [];

    // 1. Extract tool definitions from OTel metadata (highest priority)
    extractToolsFromMetadata(metadata, toolDefinitions);

    // 2. Extract tool definitions from raw input (handles cases adapters miss)
    extractToolsFromRawInput(input, toolDefinitions);

    // 3. Extract via adapter preprocessing (handles complex formats)
    const inputAdapter = selectAdapter({ ...ctx, data: input });
    const preprocessedInput = inputAdapter.preprocess(input, "input", ctx);
    const inputArray = Array.isArray(preprocessedInput)
      ? preprocessedInput
      : preprocessedInput != null
        ? [preprocessedInput]
        : [];
    const inputResult = SimpleChatMlArraySchema.safeParse(inputArray);

    if (inputResult.success) {
      for (const msg of inputResult.data) {
        // Access tools from the loosely-typed message
        const msgAny = msg as Record<string, unknown>;
        if (msgAny.tools && Array.isArray(msgAny.tools)) {
          for (const tool of msgAny.tools) {
            addToolDefinition(toolDefinitions, tool);
          }
        }
      }
    }

    // 4. Extract tool calls from raw output (handles cases adapters miss)
    extractToolCallsFromRawOutput(output, toolArguments);

    // 5. Extract via adapter preprocessing (handles complex formats)
    const outputAdapter = selectAdapter({ ...ctx, data: output });
    const preprocessedOutput = outputAdapter.preprocess(output, "output", ctx);
    const outputArray = Array.isArray(preprocessedOutput)
      ? preprocessedOutput
      : preprocessedOutput != null
        ? [preprocessedOutput]
        : [];
    const outputResult = SimpleChatMlArraySchema.safeParse(outputArray);

    if (outputResult.success) {
      for (const msg of outputResult.data) {
        const msgAny = msg as Record<string, unknown>;
        if (msgAny.tool_calls && Array.isArray(msgAny.tool_calls)) {
          for (const call of msgAny.tool_calls) {
            addToolArgument(toolArguments, call);
          }
        }
      }
    }

    // Deduplicate tool arguments by id (in case both raw and adapter extraction found same calls)
    const seenIds = new Set<string>();
    const uniqueArgs = toolArguments.filter((arg) => {
      const key = arg.id || `${arg.name}-${arg.arguments}`;
      if (seenIds.has(key)) return false;
      seenIds.add(key);
      return true;
    });

    return { toolDefinitions, toolArguments: uniqueArgs };
  } catch (error) {
    console.error("Tool extraction error:", error);
    // Fail gracefully - return empty arrays (caller handles logging)
    return { toolDefinitions: [], toolArguments: [] };
  }
}

/**
 * Convert array of tool definitions to Map format for ClickHouse.
 * Key: tool name, Value: JSON string of {description, parameters}
 */
export function convertDefinitionsToMap(
  definitions: ClickhouseToolDefinition[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const def of definitions) {
    // Last definition wins if duplicate names (shouldn't happen after dedup)
    map[def.name] = JSON.stringify({
      description: def.description ?? "",
      parameters: def.parameters ?? "",
    });
  }
  return map;
}

/**
 * Convert array of tool calls to Map format for ClickHouse.
 * Key: tool name, Value: Array of JSON strings [{id, arguments, type, index}, ...]
 */
export function convertCallsToMap(
  args: ClickhouseToolArgument[],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const arg of args) {
    const callJson = JSON.stringify({
      id: arg.id,
      arguments: arg.arguments ?? "{}",
      type: arg.type ?? "",
      index: arg.index ?? 0,
    });
    if (!map[arg.name]) {
      map[arg.name] = [];
    }
    map[arg.name].push(callJson);
  }
  return map;
}
