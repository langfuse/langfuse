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

export default function ConfigureRetention() {
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
      <Header title="Data Retention" />
      <Card className="mb-4 p-3">
        <p className="mb-4 text-sm text-primary">
          Data retention automatically deletes events older than the specified
          number of days. The value must be 0 or at least 3 days. Set to 0 to
          retain data indefinitely. The deletion happens asynchronously, i.e.
          event may be available for a while after they expired.
        </p>
        {Boolean(form.getValues().retention) &&
        form.getValues().retention !== project?.retentionDays ? (
          <p className="mb-4 text-sm text-primary">
            Your Project&#39;s retention will be set from &quot;
            {project?.retentionDays ?? "Indefinite"}
            &quot; to &quot;
            {Number(form.watch("retention")) === 0
              ? "Indefinite"
              : Number(form.watch("retention"))}
            &quot; days.
          </p>
        ) : !Boolean(project?.retentionDays) ? (
          <p className="mb-4 text-sm text-primary">
            Your Project retains data indefinitely.
          </p>
        ) : (
          <p className="mb-4 text-sm text-primary">
            Your Project&#39;s current retention is &quot;
            {project?.retentionDays ?? ""}
            &quot; days.
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
                        <span title="No access">
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
              loading={setRetention.isLoading}
              disabled={form.getValues().retention === null}
              className="mt-4"
              type="submit"
            >
              Save
            </ActionButton>
          </form>
        </Form>
      </Card>
    </div>
  );
}
