import { Terminal, ChevronDown } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import { z } from "zod/v4";
import { v4 as uuidv4 } from "uuid";

import { createEmptyMessage } from "@/src/components/ChatMessages/utils/createEmptyMessage";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { usePersistedWindowIds } from "@/src/features/playground/page/hooks/usePersistedWindowIds";
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
  OpenAIToolSchema,
  type ChatMessage,
  OpenAIResponseFormatSchema,
  type Prisma,
  type PlaceholderMessage,
  PromptType,
  isGenerationLike,
} from "@langfuse/shared";
import { normalizeInput, extractAdditionalInput } from "@/src/utils/chatml";
import { convertChatMlToPlayground } from "@/src/utils/chatml/playgroundConverter";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import usePlaygroundCache from "@/src/features/playground/page/hooks/usePlaygroundCache";

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
  const { addWindowWithId, clearAllCache } = usePersistedWindowIds();
  const [capturedState, setCapturedState] = useState<PlaygroundCache>(null);
  const [isAvailable, setIsAvailable] = useState<boolean>(false);

  // Generate a stable window ID based on the source data
  const stableWindowId = useMemo(() => {
    if (props.source === "prompt") {
      return `playground-prompt-${props.prompt.id}`;
    } else if (props.source === "generation") {
      return `playground-generation-${props.generation.id}`;
    }
    return `playground-${uuidv4()}`;
  }, [props]);
  const { setPlaygroundCache } = usePlaygroundCache(stableWindowId);

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

  const promptData = props.source === "prompt" ? props.prompt : null;
  const generationData =
    props.source === "generation" ? props.generation : null;

  useEffect(() => {
    if (promptData) {
      setCapturedState(parsePrompt(promptData));
    } else if (generationData) {
      setCapturedState(parseGeneration(generationData, modelToProviderMap));
    }
  }, [promptData, generationData, modelToProviderMap]);

  useEffect(() => {
    if (capturedState) {
      setIsAvailable(true);
    } else {
      setIsAvailable(false);
    }
  }, [capturedState, setIsAvailable]);

  const handlePlaygroundAction = (useFreshPlayground: boolean) => {
    capture(props.analyticsEventName, {
      playgroundMode: useFreshPlayground ? "fresh" : "add_to_existing",
    });

    // First, ensure we have state to save
    if (!capturedState) {
      console.warn("No captured state available for playground");
      return;
    }

    if (useFreshPlayground) {
      // Clear all existing playground data and reset to single window
      clearAllCache(stableWindowId);
    } else {
      // Add to existing playground
      const addedWindowId = addWindowWithId(stableWindowId);

      if (!addedWindowId) {
        console.warn(
          "Failed to add window to existing playground, maximum windows reached",
        );
        return;
      }
    }

    // Use requestAnimationFrame to ensure the state update has been processed
    requestAnimationFrame(() => {
      try {
        setPlaygroundCache(capturedState);
        console.log(
          `Cache saved for existing playground window ${stableWindowId}`,
        );

        // Navigate after cache is successfully saved
        router.push(`/project/${projectId}/playground`);
      } catch (error) {
        console.error("Failed to save playground cache:", error);
        // Navigate anyway, but user might not see their data
        router.push(`/project/${projectId}/playground`);
      }
    });
  };

  const tooltipMessage = isAvailable
    ? "Test in LLM playground"
    : "Test in LLM playground is not available since messages are not in valid ChatML format or tool calls have been used. If you think this is not correct, please open a GitHub issue.";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={props.variant ?? "secondary"}
          disabled={!isAvailable}
          title={tooltipMessage}
          className={cn(
            "flex items-center gap-1",
            !isAvailable ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          )}
        >
          <Terminal className="h-4 w-4" />
          <span className={cn("hidden md:inline", props.className)}>
            Playground
          </span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handlePlaygroundAction(true)}>
          <Terminal className="mr-2 h-4 w-4" />
          Fresh playground
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePlaygroundAction(false)}>
          <Terminal className="mr-2 h-4 w-4" />
          Add to existing
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const parsePrompt = (
  prompt: Prompt & { resolvedPrompt?: Prisma.JsonValue },
): PlaygroundCache => {
  if (prompt.type === PromptType.Chat) {
    try {
      const inResult = normalizeInput(prompt.resolvedPrompt);

      const messages = inResult.success
        ? inResult.data
            .map(convertChatMlToPlayground)
            .filter(
              (msg): msg is ChatMessage | PlaceholderMessage => msg !== null,
            )
        : [];

      if (messages.length === 0) return null;

      return { messages };
    } catch {
      return null;
    }
  } else {
    // Text prompt
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
  if (!isGenerationLike(generation.type)) return null;

  const modelParams = parseModelParams(generation, modelToProviderMap);
  const tools = parseTools(generation);
  const structuredOutputSchema = parseStructuredOutputSchema(generation);

  let input = generation.input?.valueOf();

  if (!input) return null;

  // parse string inputs as JSON or treat as text prompt
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      // Parse failed, treat as text prompt
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

    // After parsing, if still string, it's a text prompt
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
  }

  if (typeof input === "object") {
    try {
      const ctx = {
        metadata:
          typeof generation.metadata === "string"
            ? JSON.parse(generation.metadata)
            : generation.metadata,
        observationName: generation.name ?? undefined,
      };

      const inResult = normalizeInput(input, ctx);

      const messages = inResult.success
        ? inResult.data
            .map(convertChatMlToPlayground)
            .filter(
              (msg): msg is ChatMessage | PlaceholderMessage => msg !== null,
            )
        : [];

      if (messages.length === 0) return null;

      return {
        messages,
        modelParams,
        tools,
        structuredOutputSchema,
      };
    } catch (error) {
      return null;
    }
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
            value: value as any,
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
): PlaygroundTool[] {
  try {
    const input = JSON.parse(generation.input as string);

    // Check additional fields for tools (LangChain puts them there)
    const additionalInput = extractAdditionalInput(input);
    if (additionalInput?.tools && Array.isArray(additionalInput.tools)) {
      return additionalInput.tools.map((tool: any) => ({
        id: Math.random().toString(36).substring(2),
        name: tool.name || tool.function?.name,
        description: tool.description || tool.function?.description,
        parameters: tool.parameters || tool.function?.parameters,
      }));
    }

    // OpenAI format: tools in input.tools field
    if (typeof input === "object" && input !== null && "tools" in input) {
      const parsedTools = z.array(OpenAIToolSchema).safeParse(input["tools"]);

      if (parsedTools.success)
        return parsedTools.data.map((tool) => ({
          id: Math.random().toString(36).substring(2),
          ...tool.function,
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
