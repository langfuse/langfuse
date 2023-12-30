import { Button } from "@/src/components/ui/button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { PlayIcon } from "lucide-react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { usePostHog } from "posthog-js/react";

export function PromotePrompt({
  promptId,
  projectId,
  promptName,
  disabled,
}: {
  promptId: string;
  projectId: string;
  promptName: string;
  disabled: boolean;
}) {
  const [isPromoted, setIsPromoted] = useState(false);
  const utils = api.useUtils();
  const posthog = usePostHog();

  const hasAccess = useHasAccess({ projectId, scope: "prompts:CUD" });

  const mutPromotePrompt = api.prompts.promote.useMutation({
    onSuccess: () => {
      setIsPromoted(true);
      void utils.prompts.invalidate();
    },
  });

  if (!hasAccess) {
    return null;
  }

  return (
    <Popover key={promptId}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" disabled={disabled}>
          <PlayIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
        <p className="mb-3 text-sm">
          This action cannot be undone and promotes the prompt to production.
          SDKs requesting a prompt with name{" "}
          <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
            {promptName}
          </code>
          , will receive this prompt once confirmed.
        </p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="destructive"
            loading={mutPromotePrompt.isLoading || isPromoted}
            onClick={() => {
              void mutPromotePrompt.mutateAsync({
                promptId,
                projectId,
              });
              posthog.capture("prompt:promote");
            }}
          >
            Promote Prompt
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
