/* eslint-disable @repo/no-style-props */
import { Check, Save } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";

import { Button } from "@/src/components/ui/button";
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
} from "@/src/components/ui/input-command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { usePlaygroundContext } from "@/src/features/playground/page/context";
import usePlaygroundCache from "@/src/features/playground/page/hooks/usePlaygroundCache";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import DocPopup from "@/src/components/layouts/doc-popup";
import { PromptType } from "@langfuse/shared";
import { useTranslations } from "next-intl";

interface SaveToPromptButtonProps {
  className?: string;
}

export const SaveToPromptButton: React.FC<SaveToPromptButtonProps> = ({
  className,
}) => {
  const t = useTranslations("playgroundDashboard.playground.savePrompt");
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const { modelParams, messages, output, promptVariables } =
    usePlaygroundContext();
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const projectId = useProjectIdFromURL();
  const { setPlaygroundCache } = usePlaygroundCache();

  const allChatPromptNamesWithIds =
    api.prompts.allNames
      .useQuery(
        {
          projectId: projectId as string, // Typecast as query is enabled only when projectId is present
          type: PromptType.Chat,
        },
        { enabled: Boolean(projectId) },
      )
      .data?.map((prompt) => ({
        name: prompt.name,
        id: prompt.id,
      })) ?? [];

  const handleNewPrompt = async () => {
    capture("playground:save_to_new_prompt_button_click", { projectId });

    setPlaygroundCache({
      modelParams,
      messages,
      output,
      promptVariables,
    });

    await router.push(
      `/project/${projectId}/prompts/new?loadPlaygroundCache=true`,
    );
  };

  const handleNewPromptVersion = async () => {
    capture("playground:save_to_prompt_version_button_click", { projectId });

    setPlaygroundCache({
      modelParams,
      messages,
      output,
      promptVariables,
    });

    await router.push(
      `/project/${projectId}/prompts/new?promptId=${selectedPromptId}&loadPlaygroundCache=true`,
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-7 gap-1.5 px-2.5 text-xs @xl:hidden",
                  className,
                )}
              >
                <Save size={14} />
                <span className="sr-only">{t("action")}</span>
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent className="text-xs">{t("action")}</TooltipContent>
        </Tooltip>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "hidden h-7 gap-1.5 px-2.5 text-xs @xl:flex",
              className,
            )}
          >
            <Save size={14} />
            <span>{t("action")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <Button className="mt-2 w-full" onClick={handleNewPrompt}>
            {t("newPrompt")}
          </Button>
          <Divider label={t("or")} />
          <InputCommand className="min-h-32">
            <InputCommandInput placeholder={t("search")} variant="bottom" />
            <InputCommandEmpty>
              {t("noneFound")}
              <DocPopup description={t("chatOnly")} />
            </InputCommandEmpty>
            <InputCommandGroup className="mt-2">
              <InputCommandList>
                {allChatPromptNamesWithIds.map((chatPrompt) => (
                  <InputCommandItem
                    key={chatPrompt.id}
                    title={chatPrompt.name}
                    value={chatPrompt.name}
                    onSelect={(currentValue) => {
                      const promptId =
                        allChatPromptNamesWithIds.find(
                          (prompt) => prompt.name === currentValue,
                        )?.id ?? "";

                      setSelectedPromptId(
                        promptId === selectedPromptId ? "" : promptId,
                      );
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedPromptId === chatPrompt.id
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                      {chatPrompt.name}
                    </span>
                  </InputCommandItem>
                ))}
              </InputCommandList>
            </InputCommandGroup>
          </InputCommand>
          <Button
            className="mt-2 w-full"
            disabled={!Boolean(selectedPromptId)}
            onClick={handleNewPromptVersion}
          >
            {t("newVersion")}
          </Button>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
};

function Divider({ label }: { label: string }) {
  return (
    <div className="my-3 flex flex-row justify-center align-middle">
      <div className="flex flex-1 flex-col">
        <div className="flex-1 border-b-2 border-gray-200" />
        <div className="flex-1" />
      </div>
      <p className="mx-2 text-sm text-gray-400">{label}</p>
      <div className="flex flex-1 flex-col">
        <div className="flex-1 border-b-2 border-gray-200" />
        <div className="flex-1" />
      </div>
    </div>
  );
}
