import { Button } from "@/src/components/ui/button";

export interface DeleteAutomationPopoverContentProps {
  isPending: boolean;
  onConfirm: () => void;
}

export function DeleteAutomationPopoverContent({
  isPending,
  onConfirm,
}: DeleteAutomationPopoverContentProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-bold">Please confirm</h2>
      <p className="text-sm">
        This action permanently deletes this automation and execution history.
        This cannot be undone.
      </p>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="destructive"
          loading={isPending}
          onClick={onConfirm}
        >
          Delete Automation
        </Button>
      </div>
    </div>
  );
}
