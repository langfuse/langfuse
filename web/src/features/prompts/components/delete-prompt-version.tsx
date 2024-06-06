import { Button } from "@/src/components/ui/button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { Trash } from "lucide-react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useRouter } from "next/router";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function DeletePromptVersion({
  promptVersionId,
  version,
  countVersions,
}: {
  promptVersionId: string;
  version: number;
  countVersions: number;
}) {
  const capture = usePostHogClientCapture();
  const projectId = useProjectIdFromURL();
  const utils = api.useUtils();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const hasAccess = useHasAccess({ projectId, scope: "prompts:CUD" });

  const mutDeletePromptVersion = api.prompts.deleteVersion.useMutation({
    onSuccess: () => {
      void utils.prompts.invalidate();
      if (countVersions > 1) {
        void router.replace(
          {
            pathname: router.pathname,
            query: { ...router.query, version: undefined },
          },
          undefined,
          { shallow: true },
        );
      } else {
        void router.push(`/project/${projectId}/prompts`);
      }
    },
  });

  return (
    <Popover
      key={promptVersionId}
      open={isOpen}
      onOpenChange={() => {
        if (isOpen) {
          capture("prompt_detail:version_delete_open");
        }
        setIsOpen(!isOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          type="button"
          size="icon"
          disabled={!hasAccess}
        >
          <Trash className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
        <p className="mb-3 text-sm">
          This action deletes the prompt version. Requests of version{" "}
          <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
            {version}
          </code>
          of this prompt will return an error.
        </p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="destructive"
            loading={mutDeletePromptVersion.isLoading}
            onClick={() => {
              if (!projectId) {
                console.error("Project ID is missing");

                return;
              }
              capture("prompt_detail:version_delete_submit");

              void mutDeletePromptVersion.mutateAsync({
                promptVersionId,
                projectId,
              });
              setIsOpen(false);
            }}
          >
            Delete Prompt Version
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
