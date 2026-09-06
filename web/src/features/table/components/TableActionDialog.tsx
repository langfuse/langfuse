import { useEffect } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useForm } from "react-hook-form";
import { type TableAction } from "@/src/features/table/types";
import { TableActionTargetOptions } from "@/src/features/table/components/TableActionTargetOptions";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { ActionButton } from "@/src/components/ActionButton";
import { useOptionalEntitlement } from "@/src/features/entitlements/hooks";
import { type BatchExportTableName } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { targetOptionsQueryMap } from "@/src/features/table/components/targetOptionsQueryMap";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { useTranslations } from "next-intl";

type TableActionDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  action: TableAction;
  projectId: string;
  tableName: BatchExportTableName;
};

export function TableActionDialog({
  isOpen,
  onClose,
  onSuccess,
  action,
  projectId,
  tableName,
}: TableActionDialogProps) {
  const t = useTranslations("systemUi.tableActions");
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: action.accessCheck.scope,
  });
  const hasEntitlement = useOptionalEntitlement(action.accessCheck.entitlement);
  const form = useForm({ defaultValues: { targetId: "" } });

  const isInProgress = api.table.getIsBatchActionInProgress.useQuery(
    {
      projectId,
      // Batch action rows are keyed by (projectId, actionId, tableName); an
      // action that registers under a different table than the hosting view
      // overrides the poll target via action.tableName.
      tableName: action.tableName ?? tableName,
      actionId: action.id,
    },
    {
      refetchInterval: 2 * 60 * 1000, // 2 minutes
    },
  );

  const targetOptions = api.annotationQueues.allNamesAndIds.useQuery(
    { projectId },
    {
      enabled:
        action.type === "create" &&
        action.id in targetOptionsQueryMap &&
        hasEntitlement,
    },
  );

  // Auto-select when there's only one option
  useEffect(() => {
    const options = targetOptions?.data;
    if (options?.length === 1 && !form.getValues().targetId) {
      form.setValue("targetId", options[0].id);
    }
  }, [targetOptions?.data, form]);

  const handleConfirm = async () => {
    if ("execute" in action) {
      await action.execute({
        projectId,
        targetId: form.getValues().targetId,
      });
    }
    onSuccess();
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader variant="action">
          <DialogTitle>{action.label}</DialogTitle>
        </DialogHeader>

        {action.type === "create" && (
          <Form {...form}>
            <form
              className="space-y-6"
              onSubmit={form.handleSubmit(handleConfirm)}
            >
              <DialogBody>
                <DialogDescription>{action.description}</DialogDescription>
                <FormField
                  control={form.control}
                  name="targetId"
                  render={({ field }) => (
                    <FormItem>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("select")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <TableActionTargetOptions
                            action={action}
                            projectId={projectId}
                          />
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </DialogBody>
              <DialogFooter variant="action">
                {isInProgress.data && (
                  <div className="flex items-center gap-1">
                    <Spinner size="xxs" />
                    <p className="text-muted-foreground text-sm">
                      {t("inProgress")}
                    </p>
                  </div>
                )}
                <ActionButton
                  type="submit"
                  hasAccess={hasAccess}
                  hasEntitlement={hasEntitlement}
                  loading={isInProgress.isLoading}
                  disabled={isInProgress.data || !form.watch("targetId")}
                >
                  {t("confirm")}
                </ActionButton>
              </DialogFooter>
            </form>
          </Form>
        )}

        {action.type === "delete" && (
          <>
            <DialogBody>
              <DialogDescription>{action.description}</DialogDescription>
            </DialogBody>
            <DialogFooter variant="action">
              {isInProgress.data && (
                <div className="flex items-center gap-1">
                  <Spinner size="xxs" />
                  <p className="text-muted-foreground text-sm">
                    {t("inProgress")}
                  </p>
                </div>
              )}
              <ActionButton
                variant="destructive"
                hasAccess={hasAccess}
                hasEntitlement={hasEntitlement}
                loading={isInProgress.isLoading}
                disabled={isInProgress.data}
                onClick={handleConfirm}
              >
                {t("confirm")}
              </ActionButton>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
