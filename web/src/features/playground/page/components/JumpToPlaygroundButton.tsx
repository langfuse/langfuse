import { Terminal } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import { z } from "zod/v4";

import { createEmptyMessage } from "@/src/components/ChatMessages/utils/createEmptyMessage";
import { Button } from "@/src/components/ui/button";
import usePlaygroundCache from "@/src/features/playground/page/hooks/usePlaygroundCache";
import {
  type PlaygroundCache,
  type PlaygroundSchema,
  type PlaygroundTool,
} from "@/src/features/playground/page/types";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import {
  ChatMessageRole,
  type Observation,
  type Prompt,
  supportedModels as playgroundSupportedModels,
  type UIModelParams,
  ZodModelConfig,
  ChatMessageType,
  LLMToolCallSchema,
  OpenAIToolCallSchema,
  OpenAIToolSchema,
  type ChatMessage,
  OpenAIResponseFormatSchema,
  type Prisma,
  PlaceholderMessageSchema,
  type PlaceholderMessage,
  isPlaceholder,
  PromptType,
} from "@langfuse/shared";
import {
  LANGGRAPH_NODE_TAG,
  LANGGRAPH_STEP_TAG,
} from "@/src/features/trace-graph-view/types";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

type JumpToPlaygroundButtonProps = (
  | {
      source: "prompt";
      prompt: Prompt & { resolvedPrompt?: Prisma.JsonValue };
      analyticsEventName: "prompt_detail:test_in_playground_button_click";
    }
  | {
      source: "generation";
      generation: Omit<Observation, "input" | "output" | "metadata"> & {
        input: string | null;
        output: string | null;
        metadata: string | null;
      };
      analyticsEventName: "trace_detail:test_in_playground_button_click";
    }
) & {
  variant?: "outline" | "secondary";
  className?: string;
};

export const JumpToPlaygroundButton: React.FC<JumpToPlaygroundButtonProps> = (
  props,
) => {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const projectId = useProjectIdFromURL();
  const { setPlaygroundCache } = usePlaygroundCache();
  const [capturedState, setCapturedState] = useState<PlaygroundCache>(null);
  const [isAvailable, setIsAvailable] = useState<boolean>(false);

  const apiKeys = api.llmApiKey.all.useQuery(
    {
      projectId: projectId as string,
    },
    { enabled: Boolean(projectId) },
  );

  const modelToProviderMap = useMemo(() => {
    const modelProviderMap: Record<string, string> = {};

    (apiKeys.data?.data ?? []).forEach((apiKey) => {
      const { provider, customModels, withDefaultModels, adapter } = apiKey;
      // add default models if enabled
      if (withDefaultModels) {
        (playgroundSupportedModels[adapter] ?? []).forEach((model) => {
          modelProviderMap[model] = provider;
        });
      }

      // add custom models if set
      customModels.forEach((customModel) => {
        modelProviderMap[customModel] = provider;
      });
    });
    return modelProviderMap;
  }, [apiKeys.data]);

  useEffect(() => {
    if (props.source === "prompt") {
      setCapturedState(parsePrompt(props.prompt));
    } else if (props.source === "generation") {
      setCapturedState(parseGeneration(props.generation, modelToProviderMap));
    }
  }, [props, modelToProviderMap]);

  useEffect(() => {
    if (capturedState) {
      setIsAvailable(true);
    } else {
      setIsAvailable(false);
    }
  }, [capturedState, setIsAvailable]);

  const handleClick = () => {
    capture(props.analyticsEventName);
    setPlaygroundCache(capturedState);

    router.push(`/project/${projectId}/playground`);
  };

  return (
    <Button
      variant={props.variant ?? "secondary"}
      disabled={!isAvailable}
      title={
        isAvailable
          ? "Test in LLM playground"
          : "Test in LLM playground is not available since messages are not in valid ChatML format or tool calls have been used. If you think this is not correct, please open a GitHub issue."
      }
      onClick={handleClick}
      asChild
      className={
        !isAvailable ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }
    >
      <span>
        <Terminal className="h-4 w-4" />
        <span className={cn("hidden md:ml-2 md:inline", props.className)}>
          Playground
        </span>
      </span>
    </Button>
  );
};

// Is LangGraph Trace? Decide from metadata. If so, we might need to recognise roles as tool names
const isLangGraphTrace = (generation: { metadata: string | null }): boolean => {
  if (!generation.metadata) return false;

  try {
    let metadata = generation.metadata;
    if (typeof metadata === "string") {
      metadata = JSON.parse(metadata);
    }

    if (typeof metadata === "object" && metadata !== null) {
      return LANGGRAPH_NODE_TAG in metadata || LANGGRAPH_STEP_TAG in metadata;
    }
  } catch {
    // Ignore JSON parsing errors
  }

  return false;
};

// Normalize LangGraph tool messages by converting tool-name roles to "tool"
const normalizeLangGraphMessage = (
  message: unknown,
  isLangGraph: boolean = false,
): unknown => {
  if (!message || typeof message !== "object" || !("role" in message)) {
    return message;
  }

  const validRoles = Object.values(ChatMessageRole);

  if (isLangGraph && !validRoles.includes(message.role as ChatMessageRole)) {
    // LangGraph sets role to tool name instead of "tool"
    // Convert to proper tool message format
    return {
      ...message,
      role: ChatMessageRole.Tool,
      // TODO: remove?
      // Preserve original role in case needed for debugging
      _originalRole: message.role,
    };
  }

  return message;
};

const ParsedChatMessageListSchema = z.array(
  z.union([
    // Regular chat message
    z.object({
      role: z.enum(ChatMessageRole),
      content: z.union([
        z.string(),
        z
          .array(
            z
              .object({
                text: z.string(),
              })
              .transform((v) => v.text),
          )
          .transform((v) => v.join("")),
        z.union([z.null(), z.undefined()]).transform((_) => ""),
        z.any().transform((v) => JSON.stringify(v, null, 2)),
      ]),
      tool_calls: z
        .union([z.array(LLMToolCallSchema), z.array(OpenAIToolCallSchema)])
        .optional(),
      tool_call_id: z.string().optional(),
      additional_kwargs: z
        .object({
          tool_calls: z
            .union([z.array(LLMToolCallSchema), z.array(OpenAIToolCallSchema)])
            .optional(),
        })
        .optional(),
      _originalRole: z.string().optional(), // original LangGraph role
    }),
    PlaceholderMessageSchema,
  ]),
);

// Langchain integration has the tool definition in a tool message
// Those need to be filtered out in the chat messages and parsed when looking for tools
const isLangchainToolDefinitionMessage = (
  message: z.infer<typeof ParsedChatMessageListSchema>[0],
): message is { content: string; role: ChatMessageRole } => {
  if (!("content" in message) || typeof message.content !== "string") {
    return false;
  }
  try {
    return OpenAIToolSchema.safeParse(JSON.parse(message.content)).success;
  } catch {
    return false;
  }
};

const transformToPlaygroundMessage = (
  message: z.infer<typeof ParsedChatMessageListSchema>[0],
  allMessages?: z.infer<typeof ParsedChatMessageListSchema>,
): ChatMessage | PlaceholderMessage | null => {
  // Return placeholder messages as-is
  if (isPlaceholder(message)) {
    return message;
  }

  // Handle regular chat messages - remove the placeholder type
  const regularMessage = message as Exclude<typeof message, PlaceholderMessage>;
  const { role, content } = regularMessage;

  if (
    regularMessage.role === "assistant" &&
    (regularMessage.tool_calls || regularMessage.additional_kwargs?.tool_calls)
  ) {
    const toolCalls =
      regularMessage.tool_calls ??
      regularMessage.additional_kwargs?.tool_calls ??
      [];

    const playgroundMessage: ChatMessage = {
      role: ChatMessageRole.Assistant,
      content,
      type: ChatMessageType.AssistantToolCall,
      toolCalls: toolCalls.map((tc) => {
        if ("function" in tc) {
          return {
            name: tc.function.name,
            id: tc.id,
            args: tc.function.arguments,
          };
        }

        return tc;
      }),
    };

    return playgroundMessage;
  } else if (regularMessage.role === "tool") {
    let toolCallId = (regularMessage as any).tool_call_id;

    // Try to infer if tool_call_id is missing or empty (eg langgraph case)
    if (!toolCallId && allMessages && regularMessage._originalRole) {
      // Find all assistant messages with tool calls, most recent first
      const assistantMessages = allMessages
        .filter(
          (msg): msg is Exclude<typeof msg, PlaceholderMessage> =>
            !isPlaceholder(msg) &&
            msg.role === "assistant" &&
            !!(msg.tool_calls || msg.additional_kwargs?.tool_calls),
        )
        .reverse();

      // Look for the first matching tool call by name
      for (const prevMessage of assistantMessages) {
        const toolCalls =
          prevMessage.tool_calls ??
          prevMessage.additional_kwargs?.tool_calls ??
          [];

        const matchingCall = toolCalls.find((tc) => {
          if ("function" in tc) {
            return tc.function.name === regularMessage._originalRole;
          }
          return tc.name === regularMessage._originalRole;
        });

        if (matchingCall && matchingCall.id) {
          toolCallId = matchingCall.id;
          break;
        }
      }
    }

    const playgroundMessage: ChatMessage = {
      role: ChatMessageRole.Tool,
      content,
      type: ChatMessageType.ToolResult,
      toolCallId: toolCallId || "",
    };

    return playgroundMessage;
  } else {
    return {
      role,
      content,
      type: ChatMessageType.PublicAPICreated,
    };
  }
};

const parsePrompt = (
  prompt: Prompt & { resolvedPrompt?: Prisma.JsonValue },
): PlaygroundCache => {
  if (prompt.type === PromptType.Chat) {
    // For prompts, we can't detect LangGraph from metadata, so we check for invalid roles
    // If any msg has an invalid role, we assume it might be LangGraph format
    const isLangGraph =
      Array.isArray(prompt.resolvedPrompt) &&
      (prompt.resolvedPrompt as any[]).some(
        (msg) =>
          msg &&
          typeof msg === "object" &&
          "role" in msg &&
          !Object.values(ChatMessageRole).includes(msg.role as ChatMessageRole),
      );

    const normalizedMessages = Array.isArray(prompt.resolvedPrompt)
      ? (prompt.resolvedPrompt as any[]).map((msg) =>
          normalizeLangGraphMessage(msg, isLangGraph),
        )
      : prompt.resolvedPrompt;

    const parsedMessages =
      ParsedChatMessageListSchema.safeParse(normalizedMessages);

    if (!parsedMessages.success) {
      return null;
    }

    return {
      messages: parsedMessages.data
        .map((msg) => transformToPlaygroundMessage(msg, parsedMessages.data))
        .filter((msg): msg is ChatMessage | PlaceholderMessage => msg !== null),
    };
  } else {
    const promptString = prompt.resolvedPrompt;

    return {
      messages: [
        createEmptyMessage({
          type: ChatMessageType.System,
          role: ChatMessageRole.System,
          content: typeof promptString === "string" ? promptString : "",
        }),
      ],
    };
  }
};

const parseGeneration = (
  generation: Omit<Observation, "input" | "output" | "metadata"> & {
    input: string | null;
    output: string | null;
    metadata: string | null;
  },
  modelToProviderMap: Record<string, string>,
): PlaygroundCache => {
  if (generation.type !== "GENERATION") return null;

  const isLangGraph = isLangGraphTrace(generation);
  const modelParams = parseModelParams(generation, modelToProviderMap);
  const tools = parseTools(generation, isLangGraph);
  const structuredOutputSchema = parseStructuredOutputSchema(generation);

  let input = generation.input?.valueOf();

  if (typeof input === "string") {
    try {
      input = JSON.parse(input);

      if (typeof input === "string") {
        return {
          messages: [
            createEmptyMessage({
              type: ChatMessageType.System,
              role: ChatMessageRole.System,
              content: input,
            }),
          ],
          modelParams,
          tools,
          structuredOutputSchema,
        };
      }
    } catch (err) {
      return {
        messages: [
          createEmptyMessage({
            type: ChatMessageType.System,
            role: ChatMessageRole.System,
            content: input?.toString() ?? "",
          }),
        ],
        modelParams,
        tools,
        structuredOutputSchema,
      };
    }
  }

  if (typeof input === "object") {
    const messageData = "messages" in input ? input["messages"] : input;
    const normalizedMessages = Array.isArray(messageData)
      ? (messageData as any[]).map((msg) =>
          normalizeLangGraphMessage(msg, isLangGraph),
        )
      : messageData;

    const parsedMessages =
      ParsedChatMessageListSchema.safeParse(normalizedMessages);

    if (!parsedMessages.success) {
      return null;
    }

    const filteredMessages = parsedMessages.data.filter(
      (m) => !isLangchainToolDefinitionMessage(m),
    );
    return {
      messages: filteredMessages
        .map((msg) => transformToPlaygroundMessage(msg, filteredMessages))
        .filter((msg): msg is ChatMessage | PlaceholderMessage => msg !== null),
      modelParams,
      tools,
      structuredOutputSchema,
    };
  }

  if (typeof input === "object" && "messages" in input) {
    const normalizedMessages = Array.isArray(input["messages"])
      ? (input["messages"] as any[]).map((msg) =>
          normalizeLangGraphMessage(msg, isLangGraph),
        )
      : input["messages"];

    const parsedMessages =
      ParsedChatMessageListSchema.safeParse(normalizedMessages);

    if (!parsedMessages.success) {
      return null;
    }

    const filteredMessages = parsedMessages.data.filter(
      (m) => !isLangchainToolDefinitionMessage(m),
    );
    return {
      messages: filteredMessages
        .map((msg) => transformToPlaygroundMessage(msg, filteredMessages))
        .filter((msg): msg is ChatMessage | PlaceholderMessage => msg !== null),
      modelParams,
      tools,
      structuredOutputSchema,
    };
  }

  return null;
};

function parseModelParams(
  generation: Omit<Observation, "input" | "output" | "metadata">,
  modelToProviderMap: Record<string, string>,
):
  | (Partial<UIModelParams> & Pick<UIModelParams, "provider" | "model">)
  | undefined {
  const generationModel = generation.model?.valueOf();
  let modelParams:
    | (Partial<UIModelParams> & Pick<UIModelParams, "provider" | "model">)
    | undefined = undefined;

  if (generationModel) {
    const provider = modelToProviderMap[generationModel];

    if (!provider) return;

    modelParams = {
      provider: { value: provider, enabled: true },
      model: { value: generationModel, enabled: true },
    } as Partial<UIModelParams> & Pick<UIModelParams, "provider" | "model">;

    const generationModelParams = generation.modelParameters?.valueOf();

    if (generationModelParams && typeof generationModelParams === "object") {
      const parsedParams = ZodModelConfig.safeParse(generationModelParams);

      if (parsedParams.success) {
        Object.entries(parsedParams.data).forEach(([key, value]) => {
          if (!modelParams) return;

          modelParams[key as keyof typeof parsedParams.data] = {
            value,
            enabled: true,
          };
        });
      }
    }
  }

  return modelParams;
}

function parseTools(
  generation: Omit<Observation, "input" | "output" | "metadata"> & {
    input: string | null;
    output: string | null;
    metadata: string | null;
  },
  isLangGraph: boolean = false,
): PlaygroundTool[] {
  // OpenAI Schema
  try {
    const input = JSON.parse(generation.input as string);
    if (typeof input === "object" && input !== null && "tools" in input) {
      const parsedTools = z.array(OpenAIToolSchema).safeParse(input["tools"]);

      if (parsedTools.success)
        return parsedTools.data.map((tool) => ({
          id: Math.random().toString(36).substring(2),
          ...tool.function,
        }));
    }
  } catch {}

  // Langchain Schema
  try {
    const input = JSON.parse(generation.input as string);

    if (typeof input === "object" && input !== null) {
      const messageData = "messages" in input ? input["messages"] : input;
      const normalizedMessages = Array.isArray(messageData)
        ? (messageData as any[]).map((msg) =>
            normalizeLangGraphMessage(msg, isLangGraph),
          )
        : messageData;

      const parsedMessages =
        ParsedChatMessageListSchema.safeParse(normalizedMessages);

      if (parsedMessages.success)
        return parsedMessages.data
          .filter(isLangchainToolDefinitionMessage)
          .map((tool) => ({
            id: Math.random().toString(36).substring(2),
            ...JSON.parse(tool.content).function,
          }));
    }
  } catch {}

  return [];
}

function parseStructuredOutputSchema(
  generation: Omit<Observation, "input" | "output" | "metadata"> & {
    input: string | null;
    output: string | null;
    metadata: string | null;
  },
): PlaygroundSchema | null {
  try {
    let metadata = generation.metadata;

    try {
      if (typeof metadata === "string") {
        metadata = JSON.parse(metadata);
      }
    } catch {}

    if (
      typeof metadata === "object" &&
      metadata !== null &&
      "response_format" in metadata
    ) {
      const parseStructuredOutputSchema = OpenAIResponseFormatSchema.safeParse(
        metadata["response_format"],
      );

      if (parseStructuredOutputSchema.success)
        return {
          id: Math.random().toString(36).substring(2),
          name: parseStructuredOutputSchema.data.json_schema.name,
          description: "Schema parsed from generation",
          schema: parseStructuredOutputSchema.data.json_schema.schema,
        };
    }

    // LiteLLM records response_format in model params
    const modelParams = generation.modelParameters;

    if (
      modelParams &&
      typeof modelParams === "object" &&
      "response_format" in modelParams &&
      typeof modelParams["response_format"] === "string"
    ) {
      const parsedResponseFormat = JSON.parse(modelParams["response_format"]);

      const parseStructuredOutputSchema =
        OpenAIResponseFormatSchema.safeParse(parsedResponseFormat);

      if (parseStructuredOutputSchema.success)
        return {
          id: Math.random().toString(36).substring(2),
          name: parseStructuredOutputSchema.data.json_schema.name,
          description: "Schema parsed from generation",
          schema: parseStructuredOutputSchema.data.json_schema.schema,
        };
    }
  } catch {}
  return null;
}
