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
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { Form } from "@/src/components/ui/form";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { DropdownMenuItemWithSecondaryAction } from "@/src/components/ui/dropdown-menu";
import { getScoreDataTypeIcon } from "@/src/features/scores/lib/scoreColumns";
import {
  type CreateQueueWithAssignments,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { type ReactNode } from "react";
import { type UseFormReturn } from "react-hook-form";

type AnnotationQueueScoreConfigOption = Pick<
  ScoreConfigDomain,
  "id" | "name" | "dataType" | "isArchived"
>;

type AnnotationQueueFormDialogContentProps = {
  mode: "create" | "edit";
  form: UseFormReturn<CreateQueueWithAssignments>;
  scoreConfigs: AnnotationQueueScoreConfigOption[];
  projectId: string;
  onScoreConfigValueChange: (values: Record<string, string>[]) => void;
  onManageScoreConfigsClick: () => void;
  isAdvancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  hasQueueAssignmentsReadAccess: boolean;
  userAssignmentSection: ReactNode;
  isSubmitting: boolean;
  onSubmit: (data: CreateQueueWithAssignments) => void;
  submitLabel: string;
};

export function AnnotationQueueFormDialogContent({
  mode,
  form,
  scoreConfigs,
  projectId,
  onScoreConfigValueChange,
  onManageScoreConfigsClick,
  isAdvancedOpen,
  onAdvancedOpenChange,
  hasQueueAssignmentsReadAccess,
  userAssignmentSection,
  isSubmitting,
  onSubmit,
  submitLabel,
}: AnnotationQueueFormDialogContentProps) {
  const activeScoreConfigs = scoreConfigs.filter(
    (config) => !config.isArchived,
  );

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
                  <FormLabel>Score Configs</FormLabel>
                  <FormDescription>
                    Define which dimensions annotators should score for the
                    given queue.
                  </FormDescription>
                  <FormControl>
                    <MultiSelectKeyValues
                      placeholder="Value"
                      align="end"
                      variant="outline"
                      className="grid grid-cols-[auto_1fr_auto_auto] gap-2"
                      onValueChange={onScoreConfigValueChange}
                      options={activeScoreConfigs.map((config) => ({
                        key: config.id,
                        value: `${getScoreDataTypeIcon(config.dataType)} ${config.name}`,
                        isArchived: config.isArchived,
                      }))}
                      values={field.value.map((configId) => {
                        const config = scoreConfigs.find(
                          (scoreConfig) => scoreConfig.id === configId,
                        );
                        return {
                          value: config
                            ? `${getScoreDataTypeIcon(config.dataType)} ${config.name}`
                            : `${configId}`,
                          key: configId,
                        };
                      })}
                      controlButtons={
                        <DropdownMenuItemWithSecondaryAction
                          onBeforeAction={onManageScoreConfigsClick}
                          href={`/project/${projectId}/settings/scores`}
                          title="Manage score configs"
                        />
                      }
                    />
                  </FormControl>
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
                          onAdvancedOpenChange(false);
                        } else {
                          onAdvancedOpenChange(open);
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
                              <ChevronDown className="text-muted-foreground h-4 w-4" />
                            ) : (
                              <ChevronRight className="text-muted-foreground h-4 w-4" />
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
                            <FormControl>{userAssignmentSection}</FormControl>
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
