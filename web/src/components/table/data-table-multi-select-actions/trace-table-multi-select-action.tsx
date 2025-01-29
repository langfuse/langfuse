import { ChevronDown, ClipboardPen, Trash } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/src/components/ui/select";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSession } from "next-auth/react";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";

const addToQueueFormSchema = z.object({
  queueId: z.string(),
});

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [addToQueueDialogOpen, setAddToQueueDialogOpen] = useState(false);
  const session = useSession();
  const capture = usePostHogClientCapture();

  const hasDeleteAccess = useHasProjectAccess({
    projectId,
    scope: "traces:delete",
  });
  const mutDeleteTraces = api.traces.deleteMany.useMutation({
    onSuccess: () => {
      onDeleteSuccess();
      void utils.traces.all.invalidate();
    },
  });

  const hasAnnotationEntitlement = useHasEntitlement("annotation-queues");
  const hasTraceDeletionEntitlement = useHasEntitlement("trace-deletion");
  const hasAddToQueueAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const mutAddToQueue = api.annotationQueueItems.createMany.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        title: "Traces added to queue",
        description: `${selectedTraceIds.length} traces added to queue "${data.queueName}".`,
        link: {
          href: `/project/${projectId}/annotation-queues/${data.queueId}`,
          text: `View queue "${data.queueName}"`,
        },
      });
    },
  });

  const form = useForm<z.infer<typeof addToQueueFormSchema>>({
    resolver: zodResolver(addToQueueFormSchema),
  });

  const queues = api.annotationQueues.allNamesAndIds.useQuery(
    {
      projectId,
    },
    { enabled: session.status === "authenticated" && hasAnnotationEntitlement },
  );

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
          {hasTraceDeletionEntitlement && (
            <DropdownMenuItem
              disabled={!hasDeleteAccess}
              onClick={() => {
                capture("trace:delete_form_open", {
                  count: selectedTraceIds.length,
                  source: "table-multi-select",
                });
                setDeleteDialogOpen(true);
              }}
            >
              <Trash className="mr-2 h-4 w-4" />
              <span>Delete</span>
            </DropdownMenuItem>
          )}
          {hasAnnotationEntitlement && (
            <DropdownMenuItem
              disabled={!hasAddToQueueAccess}
              onClick={() => {
                setAddToQueueDialogOpen(true);
              }}
            >
              <ClipboardPen className="mr-2 h-4 w-4" />
              <span>Add to Annotation Queue</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setDeleteDialogOpen(false);
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
                    setDeleteDialogOpen(false);
                  });
                capture("trace:delete_form_submit", {
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

      <Dialog
        open={addToQueueDialogOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setAddToQueueDialogOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <Form {...form}>
            <form
              className="space-y-6"
              onSubmit={form.handleSubmit((data) => {
                if (data.queueId) {
                  void mutAddToQueue
                    .mutateAsync({
                      projectId,
                      queueId: data.queueId,
                      objectIds: selectedTraceIds,
                      objectType: "TRACE",
                    })
                    .then(() => {
                      setAddToQueueDialogOpen(false);
                    });
                }
              })}
            >
              <DialogHeader>
                <DialogTitle>Add to Annotation Queue</DialogTitle>
                <DialogDescription>
                  Select an annotation queue to add the selected traces to.
                </DialogDescription>
              </DialogHeader>
              <FormField
                control={form.control}
                name="queueId"
                render={({ field }) => (
                  <FormItem>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a queue" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {queues?.data?.map((queue) => (
                          <SelectItem key={queue.id} value={queue.id}>
                            {queue.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="sm:justify-start">
                <Button
                  type="submit"
                  loading={mutAddToQueue.isLoading}
                  disabled={mutAddToQueue.isLoading}
                >
                  Add {selectedTraceIds.length} trace(s) to queue
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
