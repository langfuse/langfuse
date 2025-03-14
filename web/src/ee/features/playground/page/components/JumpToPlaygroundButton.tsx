import { Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { z } from "zod";

import { createEmptyMessage } from "@/src/components/ChatMessages/utils/createEmptyMessage";
import { Button } from "@/src/components/ui/button";
import usePlaygroundCache from "@/src/ee/features/playground/page/hooks/usePlaygroundCache";
import { type PlaygroundCache } from "@/src/ee/features/playground/page/types";
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
        input: string | undefined;
        output: string | undefined;
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
      // If system message is cached, the message is an array of objects with a text property
      z
        .array(
          z
            .object({
              text: z.string(),
            })
            .transform((v) => v.text),
        )
        .transform((v) => v.join("")),
      z.any().transform((v) => JSON.stringify(v, null, 2)),
    ]),
  }),
);

const parsePrompt = (prompt: Prompt): PlaygroundCache => {
  if (prompt.type === PromptType.Chat) {
    const parsedMessages = ParsedChatMessageListSchema.safeParse(prompt.prompt);

    return parsedMessages.success ? { messages: parsedMessages.data } : null;
  } else {
    const promptString = prompt.prompt?.valueOf();

    return {
      messages: [
        createEmptyMessage(
          ChatMessageRole.System,
          typeof promptString === "string" ? promptString : "",
        ),
      ],
    };
  }
};

const parseGeneration = (
  generation: Omit<Observation, "input" | "output"> & {
    input: string | undefined;
    output: string | undefined;
  },
): PlaygroundCache => {
  if (generation.type !== "GENERATION") return null;

  const modelParams = parseModelParams(generation);
  let input = generation.input?.valueOf();

  if (typeof input === "string") {
    try {
      input = JSON.parse(input);

      if (typeof input === "string") {
        return {
          messages: [createEmptyMessage(ChatMessageRole.System, input)],
          modelParams,
        };
      }
    } catch (err) {
      return {
        messages: [
          createEmptyMessage(ChatMessageRole.System, input?.toString()),
        ],
        modelParams,
      };
    }
  }

  if (typeof input === "object") {
    const parsedMessages = ParsedChatMessageListSchema.safeParse(input);

    if (parsedMessages.success)
      return { messages: parsedMessages.data, modelParams };
  }

  if (typeof input === "object" && "messages" in input) {
    const parsedMessages = ParsedChatMessageListSchema.safeParse(
      input["messages"],
    );

    if (parsedMessages.success)
      return { messages: parsedMessages.data, modelParams };
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
