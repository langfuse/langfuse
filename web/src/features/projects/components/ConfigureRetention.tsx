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
  FormLabel,
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
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import { useState, useEffect } from "react";

export default function ConfigureRetention() {
  const { update: updateSession } = useSession();
  const { project } = useQueryProject();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: project?.id,
    scope: "project:update",
  });
  const hasEntitlement = useHasEntitlement("data-retention");

  // Get current retention configuration
  const retentionConfig = api.projects.getRetentionConfiguration.useQuery(
    { projectId: project?.id ?? "" },
    { enabled: !!project?.id },
  );

  // Get available environments
  const environmentsQuery = api.projects.environmentFilterOptions.useQuery(
    { projectId: project?.id ?? "" },
    { enabled: !!project?.id },
  );

  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>([
    "default",
  ]);

  const form = useForm({
    resolver: zodResolver(projectRetentionSchema),
    defaultValues: {
      retention: 0,
      environments: ["default"],
    },
  });

  // Update form when retention config is loaded
  useEffect(() => {
    if (retentionConfig.data) {
      form.reset({
        retention: retentionConfig.data.retention,
        environments: retentionConfig.data.environments,
      });
      setSelectedEnvironments(retentionConfig.data.environments);
    }
  }, [retentionConfig.data, form]);

  const setRetention = api.projects.setRetention.useMutation({
    onSuccess: (_) => {
      void updateSession();
      void retentionConfig.refetch();
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
        environments: selectedEnvironments,
      })
      .then(() => {
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  const availableEnvironments = environmentsQuery.data?.map(
    (env) => env.environment,
  ) ?? ["default"];
  const isEnvironmentSpecific =
    selectedEnvironments.length > 1 ||
    (selectedEnvironments.length === 1 &&
      selectedEnvironments[0] !== "default");

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

        {retentionConfig.data && (
          <p className="mb-4 text-sm text-primary">
            Current retention:{" "}
            {retentionConfig.data.retention === 0
              ? "Indefinite"
              : `${retentionConfig.data.retention} days`}
            {retentionConfig.data.isEnvironmentSpecific
              ? ` for environments: ${retentionConfig.data.environments.join(", ")}`
              : " (all environments)"}
          </p>
        )}

        {isEnvironmentSpecific && (
          <p className="mb-4 text-sm text-orange-600">
            Environment-specific retention is configured. Data will only be
            deleted from the selected environments.
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
                  <FormLabel>Retention Days</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="number"
                        step="1"
                        placeholder="0 for indefinite retention"
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

            <FormField
              control={form.control}
              name="environments"
              render={() => (
                <FormItem className="mt-4">
                  <FormLabel>Target Environments</FormLabel>
                  <FormControl>
                    <MultiSelect
                      title="Select environments"
                      options={availableEnvironments.map((env) => ({
                        value: env,
                      }))}
                      values={selectedEnvironments}
                      onValueChange={setSelectedEnvironments}
                      disabled={!hasAccess || !hasEntitlement}
                    />
                  </FormControl>
                  <p className="text-sm text-muted-foreground">
                    Select specific environments to apply retention to. Leave
                    empty or select &quot;default&quot; for all environments.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              hasEntitlement={hasEntitlement}
              loading={setRetention.isLoading}
              disabled={selectedEnvironments.length === 0}
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
