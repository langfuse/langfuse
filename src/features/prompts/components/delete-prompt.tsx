import { Button } from "@/src/components/ui/button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";

export function DeletePrompt({
  projectId,
  promptName,
}: {
  projectId: string;
  promptName: string;
}) {
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const hasAccess = useHasAccess({ projectId, scope: "prompts:CUD" });

  const mutDeletePrompt = api.prompts.delete.useMutation({
    onSuccess: () => {
      void utils.prompts.invalidate();
    },
  });

  if (!hasAccess) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
      <PopoverTrigger asChild>
        <Button variant="destructive" size="icon">
          <Trash2 className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
        <p className="mb-3 text-sm">
          This action deletes the prompt . SDKs requesting a prompt
          <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
            {promptName}
          </code>
          will not be able to receive this prompt.
        </p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="destructive"
            loading={mutDeletePrompt.isLoading}
            onClick={() => {
              void mutDeletePrompt.mutateAsync({
                projectId,
                promptName,
              });
              setIsOpen(false);
            }}
          >
            Delete Prompt
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
