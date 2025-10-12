import { Card } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import type * as z from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { LockIcon } from "lucide-react";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useSession } from "next-auth/react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { projectRetentionSchema } from "@/src/features/auth/lib/projectRetentionSchema";
import { ActionButton } from "@/src/components/ActionButton";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useTranslation } from "react-i18next";

export default function ConfigureRetention() {
  const { t } = useTranslation();
  const { update: updateSession } = useSession();
  const { project } = useQueryProject();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: project?.id,
    scope: "project:update",
  });
  const hasEntitlement = useHasEntitlement("data-retention");

  const form = useForm({
    resolver: zodResolver(projectRetentionSchema),
    defaultValues: {
      retention: project?.retentionDays ?? 0,
    },
  });
  const setRetention = api.projects.setRetention.useMutation({
    onSuccess: (_) => {
      void updateSession();
    },
    onError: (error) => form.setError("retention", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof projectRetentionSchema>) {
    if (!hasAccess || !project) return;
    capture("project_settings:retention_form_submit");
    setRetention
      .mutateAsync({
        projectId: project.id,
        retention: values.retention || null, // Fallback to null for indefinite retention
      })
      .then(() => {
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <div>
      <Header title={t("project.retention.title")} />
      <Card className="mb-4 p-3">
        <p className="mb-4 text-sm text-primary">
          {t("project.retention.description")}
        </p>
        {Boolean(form.getValues().retention) &&
        form.getValues().retention !== project?.retentionDays ? (
          <p className="mb-4 text-sm text-primary">
            {t("project.retention.willBeSet", {
              oldRetention:
                project?.retentionDays ?? t("project.retention.indefinite"),
              newRetention:
                Number(form.watch("retention")) === 0
                  ? t("project.retention.indefinite")
                  : Number(form.watch("retention")),
            })}
          </p>
        ) : !Boolean(project?.retentionDays) ? (
          <p className="mb-4 text-sm text-primary">
            {t("project.retention.retainsDataIndefinitely")}
          </p>
        ) : (
          <p className="mb-4 text-sm text-primary">
            {t("project.retention.currentRetention", {
              retentionDays: project?.retentionDays ?? "",
            })}
          </p>
        )}
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1"
            id="set-retention-project-form"
          >
            <FormField
              control={form.control}
              name="retention"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="number"
                        step="1"
                        placeholder={project?.retentionDays?.toString() ?? ""}
                        {...field}
                        value={(field.value as number) ?? ""}
                        className="flex-1"
                        disabled={!hasAccess || !hasEntitlement}
                      />
                      {!hasAccess && (
                        <span title={t("project.retention.noAccess")}>
                          <LockIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted" />
                        </span>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              hasEntitlement={hasEntitlement}
              loading={setRetention.isPending}
              disabled={form.getValues().retention === null}
              className="mt-4"
              type="submit"
            >
              {t("common.actions.save")}
            </ActionButton>
          </form>
        </Form>
      </Card>
    </div>
  );
}
