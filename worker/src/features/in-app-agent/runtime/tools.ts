import {
  standardSchemaToJSONSchema,
  toStandardSchema,
} from "@mastra/core/schema";
import { createTool, Tool } from "@mastra/core/tools";
import type { InAppAgentSandbox } from "./sandbox";
import { assertUnreachable } from "@langfuse/shared";
import { getToolFailureMessage } from "@langfuse/shared/in-app-agent/server/toolErrors";
import {
  buildDashboardsPath,
  buildDashboardWidgetPath,
  buildDatasetsPath,
  buildEvalsPath,
  buildExperimentsPath,
  buildModelsPath,
  buildMonitorsPath,
  buildPlaygroundPath,
  buildProjectMembersPath,
  buildProjectSettingsPath,
  buildPromptsPath,
  buildScoresPath,
  buildSessionPath,
  buildSessionsPath,
  buildTracePath,
  buildTracesPath,
} from "@langfuse/shared/src/server";
import z from "zod";
import {
  ObservationLevelDomain,
  TABLE_AGGREGATION_OPTIONS,
  TracingSearchType,
} from "@langfuse/shared";
import {
  InAppAgentSandboxBashArgsSchema,
  InAppAgentSandboxEditArgsSchema,
  InAppAgentSandboxReadArgsSchema,
  InAppAgentSandboxWriteArgsSchema,
  IN_APP_AGENT_REDIRECT_TOOL_NAME,
  IN_APP_AGENT_SILENT_MCP_OUTPUT_TYPE,
} from "@langfuse/shared/in-app-agent";
import {
  isSilentInAppAgentMcpToolOutput,
  toAiSdkToolModelOutput,
  type CompletedInAppAgentMcpToolCall,
  type SilentInAppAgentMcpToolOutput,
} from "@langfuse/shared/in-app-agent/server/toolResults";
export function createSandboxTools(sandbox: InAppAgentSandbox) {
  return {
    read: createTool({
      id: "read",
      description: "Read a file.",
      inputSchema: InAppAgentSandboxReadArgsSchema,
      execute: async ({ path }) => sandbox.read({ path }),
    }),
    write: createTool({
      id: "write",
      description: "Create or overwrite a file.",
      inputSchema: InAppAgentSandboxWriteArgsSchema,
      execute: async ({ path, content }) => sandbox.write({ path, content }),
    }),
    edit: createTool({
      id: "edit",
      description: "Replace an exact text span inside a file with new text.",
      inputSchema: InAppAgentSandboxEditArgsSchema,
      execute: async ({ path, oldText, newText }) =>
        sandbox.edit({ path, oldText, newText }),
    }),
    bash: createTool({
      id: "bash",
      description: "Run a shell command.",
      inputSchema: InAppAgentSandboxBashArgsSchema,
      execute: async ({ command, timeoutMs }) =>
        sandbox.bash({ command, timeoutMs }),
    }),
  };
}

const SILENT_MCP_TOOL_PARAMETER_DESCRIPTION =
  "Suppress the tool output from the conversation and save the full result to /workspace/tool_calls.";

const SilentMcpToolInputSchema = z.looseObject({
  silent: z
    .boolean()
    .optional()
    .describe(SILENT_MCP_TOOL_PARAMETER_DESCRIPTION),
});

type WrappableMcpTool = Pick<
  Tool,
  "execute" | "inputSchema" | "toModelOutput"
> &
  Required<Pick<Tool, "execute" | "inputSchema">>;

type ToolWithCallableExecute = {
  execute: (...args: never[]) => unknown;
};

export function hasCallableExecute(
  tool: unknown,
): tool is ToolWithCallableExecute {
  return (
    typeof tool === "object" &&
    tool !== null &&
    "execute" in tool &&
    typeof tool.execute === "function"
  );
}

function isWrappableMcpTool(tool: unknown): tool is WrappableMcpTool {
  return (
    hasCallableExecute(tool) &&
    "inputSchema" in tool &&
    tool.inputSchema !== undefined &&
    (!("toModelOutput" in tool) ||
      tool.toModelOutput === undefined ||
      typeof tool.toModelOutput === "function")
  );
}

export function withOptionalSilentMcpOutput(params: {
  tools: Record<string, unknown> | undefined;
  sandbox?: InAppAgentSandbox;
  onToolCallCompleted?: (toolCall: CompletedInAppAgentMcpToolCall) => void;
}): Record<string, Tool> {
  return Object.fromEntries(
    Object.entries(params.tools ?? {}).map(([toolName, tool]) => {
      if (!params.sandbox) {
        return [toolName, tool];
      }

      // MCPClient may construct tools with a different @mastra/core module
      // instance, so instanceof Tool is not reliable across package realms.
      if (!isWrappableMcpTool(tool)) {
        return [toolName, tool];
      }

      const { execute, inputSchema, toModelOutput } = tool;

      if (inputSchema instanceof z.ZodObject) {
        tool.inputSchema = inputSchema.extend({
          silent: z
            .boolean()
            .optional()
            .describe(SILENT_MCP_TOOL_PARAMETER_DESCRIPTION),
        });
      } else {
        const jsonInputSchema = standardSchemaToJSONSchema(inputSchema);
        if (jsonInputSchema.type !== "object") {
          return [toolName, tool];
        }

        tool.inputSchema = toStandardSchema({
          ...jsonInputSchema,
          properties: {
            ...jsonInputSchema.properties,
            silent: {
              type: "boolean",
              description: SILENT_MCP_TOOL_PARAMETER_DESCRIPTION,
            },
          },
        });
      }

      tool.execute = async (input, context) => {
        const { silent, ...toolInput } = SilentMcpToolInputSchema.parse(input);
        const toolCallId = getToolCallId(context);
        const createdAt = new Date();
        let result: unknown;

        try {
          result = await execute(toolInput, context);
        } catch (error) {
          if (toolCallId) {
            params.onToolCallCompleted?.({
              toolCallId,
              toolName,
              request: input,
              response: null,
              error: error instanceof Error ? error.message : String(error),
              createdAt,
            });
          }

          // Rethrow instead of returning a structured failure: the tool-error
          // chunk rewrite already feeds the error back as a tool result the
          // loop continues from, executeApprovedToolCall classifies
          // approved-tool failures from the throw, and an aborted run must
          // unwind rather than look like one more failed tool call.
          throw error;
        }

        const failureMessage = getToolFailureMessage(undefined, result);

        if (toolCallId) {
          params.onToolCallCompleted?.({
            toolCallId,
            toolName,
            request: input,
            response: result,
            error: failureMessage ?? null,
            createdAt,
          });
        }

        // Never silence a failure. A tool that reports its error in the result
        // (the MCP `isError` convention) would otherwise be collapsed to a
        // pointer at a tool_calls file that is deliberately not written.
        if (failureMessage || !silent || !toolCallId) {
          return result;
        }

        // Preserve the raw result for the existing tool_calls persistence flow.
        return {
          type: IN_APP_AGENT_SILENT_MCP_OUTPUT_TYPE,
          output: result,
          toolCallId,
          toolName,
        } satisfies SilentInAppAgentMcpToolOutput;
      };
      tool.toModelOutput = (output) => {
        if (isSilentInAppAgentMcpToolOutput(output)) {
          return toAiSdkToolModelOutput(output);
        }

        return toAiSdkToolModelOutput(
          toModelOutput ? toModelOutput(output) : output,
        );
      };

      return [toolName, tool];
    }),
  ) as Record<string, Tool>;
}

export function getToolCallId(context: unknown) {
  if (
    typeof context !== "object" ||
    context === null ||
    !("agent" in context) ||
    typeof context.agent !== "object" ||
    context.agent === null ||
    !("toolCallId" in context.agent) ||
    typeof context.agent.toolCallId !== "string"
  ) {
    return undefined;
  }

  return context.agent.toolCallId;
}

const InAppAgentRedirectDestinationSchema = z.enum([
  "alerts",
  "dashboardWidget",
  "dashboards",
  "datasets",
  "evals",
  "experiments",
  "models",
  "playground",
  "projectMembers",
  "projectSettings",
  "prompts",
  "scores",
  "session",
  "sessions",
  "trace",
  "traces",
]);

const InAppAgentRedirectBaseSchema = z.object({
  label: z.string().min(1).max(80),
});

const InAppAgentTableTimeRangePresetSchema = z.enum(TABLE_AGGREGATION_OPTIONS);

const InAppAgentTableTimeRangeStrictSchema = z.union([
  z.object({
    preset: InAppAgentTableTimeRangePresetSchema,
  }),
  z.object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  }),
]);

const InAppAgentTableTimeRangeSchema = z
  .object({
    preset: InAppAgentTableTimeRangePresetSchema.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if (!InAppAgentTableTimeRangeStrictSchema.safeParse(value).success) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either a preset or both from and to.",
      });
    }
  }) as z.ZodType<z.infer<typeof InAppAgentTableTimeRangeStrictSchema>>;

const InAppAgentTracingFiltersSchema = z.object({
  bookmarked: z.boolean().optional(),
  environment: z.array(z.string().min(1).max(100)).max(10).optional(),
  level: z.array(ObservationLevelDomain).max(4).optional(),
  metadata: z
    .array(
      z.object({
        key: z.string().min(1).max(100),
        value: z.string().max(200),
      }),
    )
    .max(5)
    .optional(),
  sessionId: z.array(z.string().min(1).max(200)).max(10).optional(),
  tags: z.array(z.string().min(1).max(100)).max(10).optional(),
  traceId: z.string().min(1).max(200).optional(),
  traceName: z.array(z.string().min(1).max(200)).max(10).optional(),
  userId: z.array(z.string().min(1).max(200)).max(10).optional(),
  version: z.string().min(1).max(200).optional(),
});

const InAppAgentTracesParamsSchema = z.object({
  filters: InAppAgentTracingFiltersSchema.optional(),
  orderBy: z
    .object({
      column: z.enum(["timestamp", "startTime", "traceName", "latency"]),
      order: z.enum(["ASC", "DESC"]),
    })
    .optional(),
  search: z
    .object({
      query: z.string().min(1).max(300),
      type: z.array(TracingSearchType).max(4).optional(),
    })
    .optional(),
  timeRange: InAppAgentTableTimeRangeSchema.optional(),
});

const InAppAgentProjectSettingsPageSchema = z.enum([
  "index",
  "api-keys",
  "developer-tools",
  "llm-connections",
  "models",
  "scores",
  "members",
  "integrations",
  "exports",
  "batch-actions",
  "audit-logs",
  "notifications",
]);

const InAppAgentRedirectToolInputStrictSchema = z.discriminatedUnion(
  "destination",
  [
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("alerts") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("dashboardWidget"),
      params: z.object({ widgetId: z.string().min(1).max(200) }),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("dashboards"),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("datasets"),
      params: z
        .object({ folder: z.string().min(1).max(200).optional() })
        .optional(),
    }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("evals") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("experiments"),
    }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("models") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("playground"),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("projectMembers"),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("projectSettings"),
      params: z
        .object({ page: InAppAgentProjectSettingsPageSchema.optional() })
        .optional(),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("prompts"),
      params: z
        .object({ folder: z.string().min(1).max(200).optional() })
        .optional(),
    }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("scores") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("session"),
      params: z.object({ sessionId: z.string().min(1).max(200) }),
    }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("sessions") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("trace"),
      params: z.object({
        timestamp: z.iso.datetime().optional(),
        traceId: z.string().min(1).max(200),
      }),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("traces"),
      params: InAppAgentTracesParamsSchema.optional(),
    }),
  ],
);

const InAppAgentRedirectParamsSchema = z.object({
  folder: z.string().min(1).max(200).optional(),
  page: InAppAgentProjectSettingsPageSchema.optional(),
  sessionId: z.string().min(1).max(200).optional(),
  timestamp: z.iso.datetime().optional(),
  traceId: z.string().min(1).max(200).optional(),
  widgetId: z.string().min(1).max(200).optional(),
  filters: InAppAgentTracingFiltersSchema.optional(),
  orderBy: InAppAgentTracesParamsSchema.shape.orderBy,
  search: InAppAgentTracesParamsSchema.shape.search,
  timeRange: InAppAgentTableTimeRangeSchema.optional(),
});

// Mastra's OpenAI compat layer duplicates each optional level; at three nested
// optionals OpenAI silently rejects the tool set. Keep `params` required.
const InAppAgentRedirectToolInputSchema = InAppAgentRedirectBaseSchema.extend({
  destination: InAppAgentRedirectDestinationSchema,
  params: InAppAgentRedirectParamsSchema,
}).superRefine((value, ctx) => {
  const result = InAppAgentRedirectToolInputStrictSchema.safeParse(value);

  if (!result.success) {
    ctx.addIssue({
      code: "custom",
      message: "Invalid redirect destination parameters.",
    });
  }
}) as z.ZodType<z.infer<typeof InAppAgentRedirectToolInputStrictSchema>>;

type InAppAgentRedirectToolInput = z.infer<
  typeof InAppAgentRedirectToolInputStrictSchema
>;

export function createRedirectActionTool({
  projectId,
  isV4Enabled,
}: {
  projectId: string;
  isV4Enabled: boolean;
}) {
  return createTool({
    id: IN_APP_AGENT_REDIRECT_TOOL_NAME,
    description:
      "Propose a user-confirmed navigation action to a known Langfuse page. This does not navigate automatically. Always include params; pass {} when the destination takes none.",
    inputSchema: InAppAgentRedirectToolInputSchema,
    execute: async (input) => {
      return getRedirectActionToolResult({
        input,
        projectId,
        isV4Enabled,
      });
    },
  });
}

function getRedirectActionToolResult({
  input,
  projectId,
  isV4Enabled,
}: {
  input: unknown;
  projectId: string;
  isV4Enabled: boolean;
}) {
  const parsedInput = InAppAgentRedirectToolInputSchema.parse(input);
  const href = getRedirectHref(parsedInput, projectId, isV4Enabled);

  return {
    type: "redirectAction" as const,
    label: parsedInput.label,
    href,
  };
}

function getRedirectHref(
  input: InAppAgentRedirectToolInput,
  projectId: string,
  isV4Enabled: boolean,
): string {
  if (input.destination === "alerts") {
    return buildMonitorsPath({ projectId });
  }

  if (input.destination === "dashboardWidget") {
    return buildDashboardWidgetPath({
      projectId,
      widgetId: input.params.widgetId,
    });
  }

  if (input.destination === "dashboards") {
    return buildDashboardsPath({ projectId });
  }

  if (input.destination === "datasets") {
    return buildDatasetsPath({
      projectId,
      folder: input.params?.folder,
    });
  }

  if (input.destination === "evals") {
    return buildEvalsPath({ projectId });
  }

  if (input.destination === "experiments") {
    return buildExperimentsPath({ projectId });
  }

  if (input.destination === "models") {
    return buildModelsPath({ projectId });
  }

  if (input.destination === "playground") {
    return buildPlaygroundPath({ projectId });
  }

  if (input.destination === "projectMembers") {
    return buildProjectMembersPath({ projectId });
  }

  if (input.destination === "projectSettings") {
    return buildProjectSettingsPath({
      projectId,
      page: input.params?.page,
    });
  }

  if (input.destination === "prompts") {
    return buildPromptsPath({
      projectId,
      folder: input.params?.folder,
    });
  }

  if (input.destination === "scores") {
    return buildScoresPath({ projectId });
  }

  if (input.destination === "session") {
    return buildSessionPath({
      projectId,
      sessionId: input.params.sessionId,
    });
  }

  if (input.destination === "sessions") {
    return buildSessionsPath({ projectId });
  }

  if (input.destination === "trace") {
    return buildTracePath({
      projectId,
      traceId: input.params.traceId,
      timestamp: input.params.timestamp,
    });
  }

  if (input.destination === "traces") {
    return buildTracesPath({
      projectId,
      isV4Enabled,
      params: input.params,
    });
  }

  return assertUnreachable(input);
}
