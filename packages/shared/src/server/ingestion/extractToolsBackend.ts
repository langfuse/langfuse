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
 * Extract tool definitions and arguments from observation input/output.
 * Uses chatml adapters for consistent parsing across frontend and backend.
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

    // Debug logging
    console.log("Extracting tools from:", {
      hasInput: !!input,
      hasOutput: !!output,
      hasMetadata: !!metadata,
      inputType: typeof input,
      outputType: typeof output,
    });

    // Extract tool definitions from input using adapters
    const inputAdapter = selectAdapter({ ...ctx, data: input });
    console.log("Selected input adapter:", inputAdapter.id);
    const preprocessedInput = inputAdapter.preprocess(input, "input", ctx);
    console.log(
      "Preprocessed input:",
      JSON.stringify(preprocessedInput).substring(0, 200),
    );
    // Wrap single message in array if needed
    const inputArray = Array.isArray(preprocessedInput)
      ? preprocessedInput
      : [preprocessedInput];
    const inputResult = SimpleChatMlArraySchema.safeParse(inputArray);
    console.log("Input validation:", {
      success: inputResult.success,
      error: inputResult.success ? undefined : inputResult.error.message,
    });

    if (inputResult.success) {
      console.log("Input messages count:", inputResult.data.length);
      for (let i = 0; i < inputResult.data.length; i++) {
        const msg = inputResult.data[i] as any; // Access fields from loose schema
        console.log(`Message ${i}:`, {
          role: msg.role,
          hasTools: !!msg.tools,
          toolsCount: msg.tools?.length,
          hasContent: !!msg.content,
        });
        if (msg.tools && Array.isArray(msg.tools)) {
          console.log(
            `  Found ${msg.tools.length} tool definitions in message ${i}`,
          );
          for (const tool of msg.tools) {
            const normalized: ClickhouseToolDefinition = {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters
                ? JSON.stringify(tool.parameters)
                : undefined,
            };
            // Deduplicate by name
            if (!toolDefinitions.some((t) => t.name === normalized.name)) {
              toolDefinitions.push(normalized);
            }
          }
        }
      }
    }

    // Extract tool calls from output using adapters
    const outputAdapter = selectAdapter({ ...ctx, data: output });
    console.log("Selected output adapter:", outputAdapter.id);
    const preprocessedOutput = outputAdapter.preprocess(output, "output", ctx);
    console.log(
      "Preprocessed output:",
      JSON.stringify(preprocessedOutput).substring(0, 200),
    );
    // Wrap single message in array if needed
    const outputArray = Array.isArray(preprocessedOutput)
      ? preprocessedOutput
      : [preprocessedOutput];
    const outputResult = SimpleChatMlArraySchema.safeParse(outputArray);
    console.log("Output validation:", {
      success: outputResult.success,
      error: outputResult.success ? undefined : outputResult.error.message,
    });

    if (outputResult.success) {
      console.log(
        "Output messages:",
        outputResult.data.length,
        "First msg has tool_calls:",
        !!outputResult.data[0]?.tool_calls,
      );
      for (const msg of outputResult.data) {
        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
          for (const call of msg.tool_calls) {
            toolArguments.push({
              id: call.id,
              name: call.name,
              arguments: call.arguments,
              type: call.type,
              index: call.index,
            });
          }
        }
      }
    }

    console.log("Extraction result:", {
      toolDefinitionsCount: toolDefinitions.length,
      toolArgumentsCount: toolArguments.length,
    });
    return { toolDefinitions, toolArguments };
  } catch (error) {
    console.error("Tool extraction error:", error);
    // Fail gracefully - return empty arrays (caller handles logging)
    return { toolDefinitions: [], toolArguments: [] };
  }
}
