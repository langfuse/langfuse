import { ChevronDown, Trash } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { usePostHog } from "posthog-js/react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useState } from "react";

export function TraceTableMultiSelectAction({
  selectedTraceIds,
  projectId,
  onDeleteSuccess,
}: {
  selectedTraceIds: string[];
  projectId: string;
  onDeleteSuccess: () => void;
}) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const posthog = usePostHog();

  const hasDeleteAccess = useHasAccess({ projectId, scope: "traces:delete" });
  const mutDeleteTraces = api.traces.deleteMany.useMutation({
    onSuccess: () => {
      onDeleteSuccess();
      void utils.traces.invalidate();
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={selectedTraceIds.length < 1}>
            Actions ({selectedTraceIds.length} selected)
            <ChevronDown className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            disabled={!hasDeleteAccess}
            onClick={() => {
              setOpen(true);
            }}
          >
            <Trash className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete traces</DialogTitle>
            <DialogDescription>
              This action cannot be undone and removes all the data associated
              with these traces.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-start">
            <Button
              type="button"
              variant="destructive"
              loading={mutDeleteTraces.isLoading}
              disabled={mutDeleteTraces.isLoading}
              onClick={() => {
                void mutDeleteTraces
                  .mutateAsync({
                    traceIds: selectedTraceIds,
                    projectId,
                  })
                  .then(() => {
                    setOpen(false);
                  });
                posthog.capture("trace:delete", {
                  count: selectedTraceIds.length,
                  source: "table-multi-select",
                });
              }}
            >
              Delete {selectedTraceIds.length} trace(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
