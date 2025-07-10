import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Trash } from "lucide-react";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

interface DeleteAutomationButtonProps {
  projectId: string;
  automationId: string;
  onSuccess?: () => void;
  variant?: "icon" | "button"; // "icon" for list view, "button" for form view
}

export const DeleteAutomationButton: React.FC<DeleteAutomationButtonProps> = ({
  projectId,
  automationId,
  onSuccess,
  variant = "icon",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });

  const deleteAutomationMutation = api.automations.deleteAutomation.useMutation(
    {
      onSuccess: () => {
        showSuccessToast({
          title: "Automation deleted",
          description: "The automation has been deleted successfully.",
        });

        if (onSuccess) {
          onSuccess();
        }

        void utils.automations.invalidate();
      },
    },
  );

  return (
    <Popover open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={!hasAccess}
          >
            <Trash className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="flex items-center border-light-red"
            disabled={!hasAccess}
          >
            <span className="text-dark-red">Delete</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
        <p className="mb-3 text-sm">
          This action permanently deletes this automation and execution history.
          This cannot be undone.
        </p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="destructive"
            loading={deleteAutomationMutation.isLoading}
            onClick={() => {
              void deleteAutomationMutation.mutateAsync({
                projectId,
                automationId,
              });
              setIsOpen(false);
            }}
          >
            Delete Automation
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
