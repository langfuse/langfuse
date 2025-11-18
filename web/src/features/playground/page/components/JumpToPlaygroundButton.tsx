import { Terminal, ChevronDown } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import { v4 as uuidv4 } from "uuid";

import { createEmptyMessage } from "@/src/components/ChatMessages/utils/createEmptyMessage";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Switch } from "@/src/components/ui/switch";
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
  type ChatMessage,
  OpenAIResponseFormatSchema,
  type Prisma,
  type PlaceholderMessage,
  PromptType,
  isGenerationLike,
} from "@langfuse/shared";
import { normalizeInput, normalizeOutput } from "@/src/utils/chatml";
import { extractTools } from "@/src/utils/chatml/extractTools";
import { convertChatMlToPlayground } from "@/src/utils/chatml/playgroundConverter";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import usePlaygroundCache from "@/src/features/playground/page/hooks/usePlaygroundCache";
import {
  type MetadataDomainClient,
  type WithStringifiedMetadata,
} from "@/src/utils/clientSideDomainTypes";

type JumpToPlaygroundButtonProps = (
  | {
      source: "prompt";
      prompt: Prompt & { resolvedPrompt?: Prisma.JsonValue };
      analyticsEventName: "prompt_detail:test_in_playground_button_click";
    }
  | {
      source: "generation";
      generation: Omit<
        WithStringifiedMetadata<Observation>,
        "input" | "output"
      > & {
        input: string | null;
        output: string | null;
      };
      analyticsEventName: "trace_detail:test_in_playground_button_click";
    }
) & {
  variant?: "outline" | "secondary";
  className?: string;
  size?: "default" | "sm" | "xs" | "lg" | "icon" | "icon-xs" | "icon-sm";
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
  const [includeOutput, setIncludeOutput] = useState<boolean>(false);

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
      setCapturedState(
        parseGeneration(generationData, modelToProviderMap, includeOutput),
      );
    }
  }, [promptData, generationData, modelToProviderMap, includeOutput]);

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
          size={props.size ?? "default"}
          disabled={!isAvailable}
          title={tooltipMessage}
          className={cn(
            "flex items-center gap-1",
            !isAvailable ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          )}
        >
          <Terminal
            className={props.size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}
          />
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
        {props.source === "generation" && (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-sm">Include output</span>
              <Switch
                checked={includeOutput}
                onCheckedChange={setIncludeOutput}
              />
            </div>
          </>
        )}
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
  generation: Omit<WithStringifiedMetadata<Observation>, "input" | "output"> & {
    input: string | null;
    output: string | null;
  },
  modelToProviderMap: Record<string, string>,
  includeOutput: boolean = false,
): PlaygroundCache => {
  if (!isGenerationLike(generation.type)) return null;

  let modelParams = parseModelParams(generation, modelToProviderMap);
  const tools = parseTools(
    generation.input,
    generation.output,
    generation.metadata,
  );

  const structuredOutputSchema = parseStructuredOutputSchema(generation);
  const providerOptions = parseLitellmMetadataFromGeneration(generation);

  if (modelParams && providerOptions) {
    const existingProviderOptions =
      modelParams.providerOptions?.value ??
      ({} as UIModelParams["providerOptions"]["value"]);

    const mergedProviderOptions = {
      ...existingProviderOptions,
      ...providerOptions,
    } as UIModelParams["providerOptions"]["value"];

    modelParams = {
      ...modelParams,
      providerOptions: {
        value: mergedProviderOptions,
        enabled: true,
      },
    };
  }

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

      let messages = inResult.success
        ? inResult.data
            .map(convertChatMlToPlayground)
            .filter(
              (msg): msg is ChatMessage | PlaceholderMessage => msg !== null,
            )
        : [];

      if (includeOutput) {
        // process output for final assistant message
        // this doesn't make that much sense, because the output is already the LLM result
        // but some people wanted to have the entire thing, so that they can then iterate
        // on the final result (e.g. ask it questions).
        // NOTE: will probably remove later at some point on next playground release
        let output = generation.output?.valueOf();
        if (output && typeof output === "string") {
          try {
            output = JSON.parse(output);
          } catch {
            // ignore parse errors
          }
        }

        if (output && typeof output === "object") {
          try {
            const outResult = normalizeOutput(output, ctx);
            const outputMessages = outResult.success
              ? outResult.data
                  .map(convertChatMlToPlayground)
                  .filter(
                    (msg): msg is ChatMessage | PlaceholderMessage =>
                      msg !== null,
                  )
                  // Filter tool calls without results (i.e. assistant messages with tool_calls but no results)
                  // here, a tool was just selected by an LLM but not called yet.
                  // we don't want this in the playground, because we a) cannot run the playground
                  // and b) if we jump to the playground, we exactly want to test if the LLM selects the tool
                  .filter(
                    (msg) => msg.type !== ChatMessageType.AssistantToolCall,
                  )
              : [];

            // Append output messages to input messages
            messages = [...messages, ...outputMessages];
          } catch {
            // ignore output processing errors
          }
        }
      }

      if (messages.length === 0) return null;

      // Extract tools from normalized ChatML messages (they may have tools attached)
      const normalizedTools =
        inResult.success && inResult.data
          ? extractTools(inResult.data, ctx.metadata)
          : [];

      // Merge with tools from input/metadata, prefer normalized tools
      const mergedTools = normalizedTools.length > 0 ? normalizedTools : tools;

      return {
        messages,
        modelParams,
        tools: mergedTools,
        structuredOutputSchema,
      };
    } catch {
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
  inputString: string | null,
  outputString: string | null,
  metadataString: MetadataDomainClient,
): PlaygroundTool[] {
  if (!inputString && !outputString && !metadataString) return [];

  try {
    const input = inputString ? JSON.parse(inputString) : null;
    const output = outputString ? JSON.parse(outputString) : null;
    const metadata = metadataString ? JSON.parse(metadataString) : null;

    const inputTools = extractTools(input, metadata);
    if (inputTools.length > 0) return inputTools;

    // also check the output for tools, e.g. if a user jumps from the last generation
    if (output) {
      return extractTools(output, metadata);
    }

    return [];
  } catch {
    return [];
  }
}

function parseStructuredOutputSchema(
  generation: Omit<WithStringifiedMetadata<Observation>, "input" | "output"> & {
    input: string | null;
    output: string | null;
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

/**
 * LiteLLM supports custom providers such as with its CustomLLM interface. Clients may
 * send provider‑specific options in addition to standard parameters (e.g., temperature, top_p, max_tokens).
 * LiteLLM records those extras on the generation as metadata.requester_metadata. When a user clicks
 * “Open in Playground,” we lift requester_metadata into providerOptions so those custom options carry
 * over for re‑run/compare/edit. This lets the Playground faithfully replay LiteLLM CustomLLM‑based
 * workflows and preserves the original call’s intent.
 *
 * References:
 * - https://docs.litellm.ai/docs/providers/custom_llm_server
 * - https://docs.litellm.ai/docs/proxy/logging_spec#standardloggingmetadata
 */
function parseLitellmMetadataFromGeneration(
  generation: Omit<WithStringifiedMetadata<Observation>, "input" | "output"> & {
    input: string | null;
    output: string | null;
  },
): UIModelParams["providerOptions"]["value"] | undefined {
  let metadata: unknown = generation.metadata;

  if (metadata === null || metadata === undefined) {
    return undefined;
  }

  if (typeof metadata === "string") {
    const trimmedMetadata = metadata.trim();

    if (!trimmedMetadata) {
      return undefined;
    }

    try {
      metadata = JSON.parse(trimmedMetadata);
    } catch {
      return undefined;
    }
  }

  if (typeof metadata !== "object" || metadata === null) {
    return undefined;
  }

  const requesterMetadata = (metadata as Record<string, unknown>)[
    "requester_metadata"
  ];

  if (typeof requesterMetadata !== "object" || requesterMetadata === null) {
    return undefined;
  }

  return {
    metadata: requesterMetadata,
  } as UIModelParams["providerOptions"]["value"];
}
