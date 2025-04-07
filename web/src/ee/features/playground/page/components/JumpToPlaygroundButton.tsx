import { Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { z } from "zod";

import { createEmptyMessage } from "@/src/components/ChatMessages/utils/createEmptyMessage";
import { Button } from "@/src/components/ui/button";
import usePlaygroundCache from "@/src/ee/features/playground/page/hooks/usePlaygroundCache";
import {
  type PlaygroundTool,
  type PlaygroundCache,
  type PlaygroundSchema,
} from "@/src/ee/features/playground/page/types";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { PromptType } from "@/src/features/prompts/server/utils/validation";
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
} from "@langfuse/shared";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { cn } from "@/src/utils/tailwind";

type JumpToPlaygroundButtonProps = (
  | {
      source: "prompt";
      prompt: Prompt;
      analyticsEventName: "prompt_detail:test_in_playground_button_click";
    }
  | {
      source: "generation";
      generation: Omit<Observation, "input" | "output"> & {
        input: string | null;
        output: string | null;
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
  const isEntitled = useHasEntitlement("playground");

  useEffect(() => {
    if (props.source === "prompt") {
      setCapturedState(parsePrompt(props.prompt));
    } else if (props.source === "generation") {
      setCapturedState(parseGeneration(props.generation));
    }
  }, [props]);

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

  if (!isEntitled) return null;

  return (
    <Button
      variant={props.variant ?? "secondary"}
      disabled={!isAvailable}
      title={
        isAvailable
          ? "Test in LLM playground"
          : "Test in LLM playground is not available since messages are not in valid ChatML format or tool calls have been used. If you think this is not correct, please open a Github issue."
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

const ParsedChatMessageListSchema = z.array(
  z.object({
    role: z.nativeEnum(ChatMessageRole),
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
  }),
);

// Langchain integration has the tool definition in a tool message
// Those need to be filtered out in the chat messages and parsed when looking for tools
const isLangchainToolDefinitionMessage = (
  message: z.infer<typeof ParsedChatMessageListSchema>[0],
): message is { content: string; role: ChatMessageRole } => {
  try {
    return OpenAIToolSchema.safeParse(JSON.parse(message.content)).success;
  } catch {
    return false;
  }
};

const transformToPlaygroundMessage = (
  message: z.infer<typeof ParsedChatMessageListSchema>[0],
): ChatMessage => {
  const { role, content } = message;

  if (
    message.role === "assistant" &&
    (message.tool_calls || message.additional_kwargs?.tool_calls)
  ) {
    const toolCalls =
      message.tool_calls ?? message.additional_kwargs?.tool_calls ?? [];

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
  } else if (message.role === "tool") {
    const playgroundMessage: ChatMessage = {
      role: ChatMessageRole.Tool,
      content,
      type: ChatMessageType.ToolResult,
      toolCallId: message.tool_call_id ?? "",
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

const parsePrompt = (prompt: Prompt): PlaygroundCache => {
  if (prompt.type === PromptType.Chat) {
    const parsedMessages = ParsedChatMessageListSchema.safeParse(prompt.prompt);

    return parsedMessages.success
      ? { messages: parsedMessages.data.map(transformToPlaygroundMessage) }
      : null;
  } else {
    const promptString = prompt.prompt?.valueOf();

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
  generation: Omit<Observation, "input" | "output"> & {
    input: string | null;
    output: string | null;
  },
): PlaygroundCache => {
  if (generation.type !== "GENERATION") return null;

  const modelParams = parseModelParams(generation);
  const tools = parseTools(generation);
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
    const parsedMessages = ParsedChatMessageListSchema.safeParse(
      "messages" in input ? input["messages"] : input,
    );

    if (parsedMessages.success)
      return {
        messages: parsedMessages.data
          .filter((m) => !isLangchainToolDefinitionMessage(m))
          .map(transformToPlaygroundMessage),
        modelParams,
        tools,
        structuredOutputSchema,
      };
  }

  if (typeof input === "object" && "messages" in input) {
    const parsedMessages = ParsedChatMessageListSchema.safeParse(
      input["messages"],
    );

    if (parsedMessages.success)
      return {
        messages: parsedMessages.data
          .filter((m) => !isLangchainToolDefinitionMessage(m))
          .map(transformToPlaygroundMessage),
        modelParams,
        tools,
        structuredOutputSchema,
      };
  }

  return null;
};

function parseModelParams(
  generation: Omit<Observation, "input" | "output">,
):
  | (Partial<UIModelParams> & Pick<UIModelParams, "provider" | "model">)
  | undefined {
  const generationModel = generation.model?.valueOf();
  let modelParams:
    | (Partial<UIModelParams> & Pick<UIModelParams, "provider" | "model">)
    | undefined = undefined;

  if (generationModel) {
    const provider = Object.entries(playgroundSupportedModels).find(
      ([_, models]) =>
        generationModel ? models.some((m) => m === generationModel) : false,
    )?.[0];

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

function parseTools(generation: Observation): PlaygroundTool[] {
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
      const parsedMessages = ParsedChatMessageListSchema.safeParse(
        "messages" in input ? input["messages"] : input,
      );

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
  generation: Observation,
): PlaygroundSchema | null {
  try {
    const metadata = generation.metadata;

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
  } catch {}
  return null;
}
