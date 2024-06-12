import { Check, FileInput } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { usePlaygroundContext } from "@/src/ee/features/playground/page/context";
import usePlaygroundCache from "@/src/ee/features/playground/page/hooks/usePlaygroundCache";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { PromptType } from "@/src/features/prompts/server/utils/validation";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { useIsEeEnabled } from "@/src/ee/utils/useIsEeEnabled";

export const SaveToPromptButton: React.FC = () => {
  const isEeEnabled = useIsEeEnabled();
  const [open, setOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const { modelParams, messages, output, promptVariables } =
    usePlaygroundContext();
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const projectId = useProjectIdFromURL();
  const { setPlaygroundCache } = usePlaygroundCache();

  const allPromptNames =
    api.prompts.all
      .useQuery(
        {
          projectId: projectId as string, // Typecast as query is enabled only when projectId is present
          filter: [],
          orderBy: { column: "name", order: "ASC" },
          page: 0,
        },
        { enabled: Boolean(projectId) },
      )
      .data?.prompts.filter((prompt) => prompt.type === PromptType.Chat)
      .map((prompt) => ({
        label: prompt.name,
        value: prompt.id,
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

  if (!isEeEnabled) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={"outline"} title="Save to prompt" asChild>
          <Link href={`/project/${projectId}/playground`}>
            <FileInput className="mr-1 h-5 w-5" />
            <span>Save as prompt</span>
          </Link>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <Button className="mt-2 w-full" onClick={handleNewPrompt}>
          Save as new prompt
        </Button>
        <Divider />
        <Command className="min-h-[8rem]">
          <CommandInput placeholder="Search chat prompts..." />
          <CommandEmpty>No chat prompt found.</CommandEmpty>
          <CommandGroup className="mt-2">
            <CommandList>
              {allPromptNames.map((promptName) => (
                <CommandItem
                  key={promptName.value}
                  title={promptName.label}
                  value={promptName.value}
                  onSelect={(currentValue) => {
                    setSelectedPromptId(
                      currentValue === selectedPromptId ? "" : currentValue,
                    );
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedPromptId === promptName.value
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                    {promptName.label}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </CommandGroup>
        </Command>
        <Button
          className="mt-2 w-full"
          disabled={!Boolean(selectedPromptId)}
          onClick={handleNewPromptVersion}
        >
          Save as new prompt version
        </Button>
      </PopoverContent>
    </Popover>
  );
};

export function Divider() {
  return (
    <div className="my-6 flex flex-row justify-center align-middle">
      <div className="flex flex-1 flex-col">
        <div className="flex-1 border-b-2 border-gray-200" />
        <div className="flex-1" />
      </div>
      <p className="mx-2 text-sm text-gray-400">or</p>
      <div className="flex flex-1 flex-col">
        <div className="flex-1 border-b-2 border-gray-200" />
        <div className="flex-1" />
      </div>
    </div>
  );
}
