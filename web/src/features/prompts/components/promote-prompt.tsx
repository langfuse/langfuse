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
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

export function PromotePrompt({
  promptId,
  promptName,
  disabled,
  variant,
}: {
  promptId: string;
  promptName: string;
  disabled: boolean;
  variant?: "ghost" | "outline";
}) {
  const projectId = useProjectIdFromURL();
  const utils = api.useUtils();
  const posthog = usePostHog();
  const [isOpen, setIsOpen] = useState(false);
  const hasAccess = useHasAccess({ projectId, scope: "prompts:CUD" });

  const mutPromotePrompt = api.prompts.promote.useMutation({
    onSuccess: () => {
      void utils.prompts.invalidate();
    },
  });

  if (!hasAccess) {
    return null;
  }

  return (
    <Popover
      key={promptId}
      open={isOpen}
      onOpenChange={() => setIsOpen(!isOpen)}
    >
      <PopoverTrigger asChild>
        <Button
          variant={variant ?? "ghost"}
          size={variant ? "icon" : "xs"}
          disabled={disabled}
          aria-label="Promote Prompt to production"
          title="Promote Prompt to production"
        >
          <PlayIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
        <p className="mb-3 text-sm">
          This action promotes the prompt to production. SDKs requesting a
          prompt with name{" "}
          <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
            {promptName}
          </code>
          will receive this prompt. Make sure that the variables match.
        </p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="destructive"
            loading={mutPromotePrompt.isLoading}
            onClick={() => {
              if (!projectId) {
                console.error("Project ID is missing");

                return;
              }

              void mutPromotePrompt.mutateAsync({
                promptId,
                projectId,
              });
              posthog.capture("prompt:promote");
              setIsOpen(false);
            }}
          >
            Promote to production
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
