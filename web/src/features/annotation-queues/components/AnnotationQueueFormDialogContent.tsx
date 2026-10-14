import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Form,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { Settings2 } from "lucide-react";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import Link from "next/link";
import {
  CreateQueueWithAssignmentsData,
  type CreateQueueWithAssignments,
} from "@langfuse/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { UserAssignmentSection } from "@/src/features/annotation-queues/components/UserAssignmentSection";
import { useUniqueNameValidation } from "@/src/hooks/useUniqueNameValidation";

type AnnotationQueueFormDialogContentProps = {
  mode: "create" | "edit";
  initialValues: CreateQueueWithAssignments;
  renderScoreConfigEditor: (control: {
    value: string[];
    onChange: (ids: string[]) => void;
  }) => ReactNode;
  projectId: string;
  queueId?: string;
  queueNames: string[];
  onManageScoreConfigsClick: () => void;
  hasQueueAssignmentsReadAccess: boolean;
  isSubmitting: boolean;
  onSubmit: (data: CreateQueueWithAssignments) => void;
  submitLabel: string;
};

export function AnnotationQueueFormDialogContent({
  mode,
  initialValues,
  renderScoreConfigEditor,
  projectId,
  queueId,
  queueNames,
  onManageScoreConfigsClick,
  hasQueueAssignmentsReadAccess,
  isSubmitting,
  onSubmit,
  submitLabel,
}: AnnotationQueueFormDialogContentProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const form = useForm<CreateQueueWithAssignments>({
    resolver: zodResolver(CreateQueueWithAssignmentsData),
    defaultValues: initialValues,
  });
  const queueNameOptions = useMemo(
    () => queueNames.map((name) => ({ value: name })),
    [queueNames],
  );

  useUniqueNameValidation({
    currentName: form.watch("name"),
    allNames: queueNameOptions,
    form,
    errorMessage: "Queue name already exists.",
    whitelistedName: mode === "edit" ? initialValues.name : undefined,
  });

  const handleScoreConfigValueChange = (values: string[]) => {
    form.setValue("scoreConfigIds", values, { shouldDirty: true });

    if (values.length === 0) {
      form.setError("scoreConfigIds", {
        type: "manual",
        message: "At least 1 score config must be selected",
      });
    } else {
      form.clearErrors("scoreConfigIds");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {mode === "edit" ? "Edit" : "New"} annotation queue
        </DialogTitle>
        <DialogDescription>
          {mode === "edit" ? "Edit" : "Create a new"} queue to manage your
          annotation workflows.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
          <DialogBody>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      className="text-xs"
                      onBlur={(e) => field.onChange(e.target.value.trimEnd())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Add description..."
                      className="text-xs focus:ring-0 focus:outline-hidden focus-visible:ring-0 focus-visible:ring-offset-0 active:ring-0"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="scoreConfigIds"
              render={({ field }) => (
                <FormItem>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FormLabel>Score configs</FormLabel>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-accent gap-1.5 text-xs"
                      asChild
                    >
                      <Link
                        href={`/project/${projectId}/settings/scores`}
                        target="_blank"
                        onClick={onManageScoreConfigsClick}
                        onAuxClick={(event) => {
                          if (event.button === 1) onManageScoreConfigsClick();
                        }}
                      >
                        <Settings2
                          className="icon-base text-icon-foreground"
                          aria-hidden="true"
                        />
                        Manage score configs
                      </Link>
                    </Button>
                  </div>
                  <FormDescription>
                    Selected score configs are the fields annotators see, in
                    this order. Use the arrows to reorder them. Reordering keeps
                    existing scores unchanged.
                  </FormDescription>
                  {renderScoreConfigEditor({
                    value: field.value,
                    onChange: handleScoreConfigValueChange,
                  })}
                  <FormDescription>
                    Score config definitions are project-wide. Editing one can
                    affect future scoring in other queues and through the
                    API/SDK.
                    {mode === "edit" && (
                      <>
                        {" "}
                        Adding or removing fields takes effect when items are
                        reopened, including completed items. Completion status
                        and historical scores stay unchanged.
                      </>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newAssignmentUserIds"
              render={() => (
                <FormItem>
                  <FormLabel>Advanced Settings</FormLabel>
                  <div className="mt-1 rounded-md border">
                    <Collapsible
                      open={isAdvancedOpen && hasQueueAssignmentsReadAccess}
                      onOpenChange={(open) => {
                        if (!hasQueueAssignmentsReadAccess) {
                          setIsAdvancedOpen(false);
                        } else {
                          setIsAdvancedOpen(open);
                        }
                      }}
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className="group flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-transparent"
                        >
                          <div className="flex items-center gap-2">
                            {isAdvancedOpen ? (
                              <DropdownIndicator nudge />
                            ) : (
                              <DropdownIndicator direction="right" nudge />
                            )}
                            <span className="text-sm font-bold">
                              User Assignment
                            </span>
                          </div>
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="border-border/20 border-t px-3 pt-1 pb-3">
                        {hasQueueAssignmentsReadAccess ? (
                          <>
                            <FormControl>
                              <UserAssignmentSection
                                projectId={projectId}
                                queueId={queueId}
                                selectedUserIds={form.watch(
                                  "newAssignmentUserIds",
                                )}
                                onChange={(userIds) =>
                                  form.setValue("newAssignmentUserIds", userIds)
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </>
                        ) : null}
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </FormItem>
              )}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              type="submit"
              className="text-xs"
              disabled={!!form.formState.errors.name || isSubmitting}
            >
              {isSubmitting ? "Processing..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
