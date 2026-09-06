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
import { ChevronDown, ChevronRight } from "lucide-react";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { DropdownMenuItemWithSecondaryAction } from "@/src/components/ui/dropdown-menu";
import { getScoreDataTypeIcon } from "@/src/features/scores/lib/scoreColumns";
import {
  CreateQueueWithAssignmentsData,
  type CreateQueueWithAssignments,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { UserAssignmentSection } from "@/src/features/annotation-queues/components/UserAssignmentSection";
import { useUniqueNameValidation } from "@/src/hooks/useUniqueNameValidation";
import { useTranslations } from "next-intl";

type AnnotationQueueScoreConfigOption = Pick<
  ScoreConfigDomain,
  "id" | "name" | "dataType" | "isArchived"
>;

type AnnotationQueueFormDialogContentProps = {
  mode: "create" | "edit";
  initialValues: CreateQueueWithAssignments;
  scoreConfigs: AnnotationQueueScoreConfigOption[];
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
  scoreConfigs,
  projectId,
  queueId,
  queueNames,
  onManageScoreConfigsClick,
  hasQueueAssignmentsReadAccess,
  isSubmitting,
  onSubmit,
  submitLabel,
}: AnnotationQueueFormDialogContentProps) {
  const t = useTranslations("evaluationAnalytics.annotationQueues");
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
    errorMessage: t("nameExists"),
  });

  const handleScoreConfigValueChange = (values: Record<string, string>[]) => {
    form.setValue(
      "scoreConfigIds",
      values.map((value) => value.key),
    );

    if (values.length === 0) {
      form.setError("scoreConfigIds", {
        type: "manual",
        message: t("scoreConfigRequired"),
      });
    } else {
      form.clearErrors("scoreConfigIds");
    }
  };

  const activeScoreConfigs = scoreConfigs.filter(
    (config) => !config.isArchived,
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {mode === "edit" ? t("editTitle") : t("newTitle")}
        </DialogTitle>
        <DialogDescription>
          {mode === "edit" ? t("editDescription") : t("createDescription")}
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
                  <FormLabel>{t("name")}</FormLabel>
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
                  <FormLabel>{t("descriptionOptional")}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={t("descriptionPlaceholder")}
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
                  <FormLabel>{t("scoreConfigs")}</FormLabel>
                  <FormDescription>
                    {t("scoreConfigsDescription")}
                  </FormDescription>
                  <FormControl>
                    <MultiSelectKeyValues
                      placeholder={t("valuePlaceholder")}
                      align="end"
                      variant="outline"
                      className="grid grid-cols-[auto_1fr_auto_auto] gap-2"
                      onValueChange={handleScoreConfigValueChange}
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
                          target="_blank"
                          title={t("manageScoreConfigs")}
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
                  <FormLabel>{t("advancedSettings")}</FormLabel>
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
                              <ChevronDown className="text-muted-foreground h-4 w-4" />
                            ) : (
                              <ChevronRight className="text-muted-foreground h-4 w-4" />
                            )}
                            <span className="text-sm font-bold">
                              {t("userAssignment")}
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
              {isSubmitting ? t("processing") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
