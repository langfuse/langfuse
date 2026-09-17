import { zodResolver } from "@hookform/resolvers/zod";
import {
  validateExportSource,
  type ExportSourceContext,
} from "@langfuse/shared";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { type z } from "zod";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  getExportSourceUnavailableMessage,
  isExportSourceSelectable,
  type SelectableExportSourceOption,
} from "@/src/features/analytics-integrations/exportSource";
import { posthogIntegrationFormSchema } from "@/src/features/posthog-integration/types";

type PostHogIntegrationFormInput = z.input<typeof posthogIntegrationFormSchema>;

export type PostHogIntegrationFormValues = z.output<
  typeof posthogIntegrationFormSchema
>;

type PostHogIntegrationFormProps = {
  actionState: "idle" | "saving" | "resetting";
  configurationState: "new" | "configured";
  defaultValues: Required<PostHogIntegrationFormValues>;
  // Required to validate the selected export source against deployment policy.
  exportSourceContext: ExportSourceContext;
  exportSourceOptions: SelectableExportSourceOption[];
  onReset: () => void | Promise<void>;
  onSubmit: (values: PostHogIntegrationFormValues) => void;
  projectApiKeyDisplay?: string;
  resetError?: string;
  showExportSourceField: boolean;
};

export function PostHogIntegrationForm({
  actionState,
  configurationState,
  defaultValues,
  exportSourceContext,
  exportSourceOptions,
  onReset,
  onSubmit,
  projectApiKeyDisplay,
  resetError,
  showExportSourceField,
}: PostHogIntegrationFormProps) {
  const formSchema = useMemo(
    () =>
      posthogIntegrationFormSchema.superRefine((data, ctx) => {
        if (configurationState === "new" && !data.posthogProjectApiKey) {
          ctx.addIssue({
            code: "custom",
            path: ["posthogProjectApiKey"],
            message: "PostHog Project API Key is required",
          });
        }
        if (!isExportSourceSelectable(data.exportSource, exportSourceContext)) {
          ctx.addIssue({
            code: "custom",
            path: ["exportSource"],
            message:
              "This export source is not available on this deployment. Select an available export source to save.",
          });
        }
      }),
    [configurationState, exportSourceContext],
  );

  const form = useForm<
    PostHogIntegrationFormInput,
    undefined,
    PostHogIntegrationFormValues
  >({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const watchedExportSource = form.watch("exportSource");
  const watchedValidation =
    watchedExportSource != null
      ? validateExportSource(watchedExportSource, exportSourceContext)
      : ({ ok: true } as const);

  return (
    <div className="space-y-8">
      <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="posthogHostname"
          label="Posthog Hostname"
          description="US region: https://us.posthog.com; EU region: https://eu.posthog.com"
        >
          {(field) => (
            <Input
              id={field.id}
              name={field.name}
              value={field.value}
              onBlur={field.onBlur}
              onChange={field.onChange}
              ref={field.ref}
              aria-describedby={field.inputDescribedById}
              aria-invalid={Boolean(field.error)}
            />
          )}
        </FormField>
        <FormField
          control={form.control}
          name="posthogProjectApiKey"
          label="Posthog Project API Key"
          description={
            configurationState === "configured"
              ? "Leave blank to keep the current API key."
              : undefined
          }
        >
          {(field) => (
            <PasswordInput
              id={field.id}
              name={field.name}
              value={field.value}
              onBlur={field.onBlur}
              onChange={field.onChange}
              ref={field.ref}
              aria-describedby={field.inputDescribedById}
              aria-invalid={Boolean(field.error)}
              placeholder={
                configurationState === "configured"
                  ? projectApiKeyDisplay
                  : undefined
              }
            />
          )}
        </FormField>
        {showExportSourceField ? (
          <CustomTooltip
            placement="bottom"
            content={
              <div className="space-y-2 py-1.5">
                {exportSourceOptions.map((option) => (
                  <div key={option.value} className="space-y-0.5">
                    <div className="font-bold">{option.label}</div>
                    <div className="text-muted-foreground text-xs">
                      {option.description}
                    </div>
                  </div>
                ))}
                <div className="border-t pt-2">
                  <a
                    href="https://langfuse.com/docs/integrations/export-sources"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    For further information see
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            }
          >
            {({ getTriggerProps }) => (
              <FormField
                control={form.control}
                name="exportSource"
                label="Export Source"
                description="Choose which data sources to export to PostHog. Scores are always included."
                registerLabelTooltip={getTriggerProps}
              >
                {(field) => (
                  <SelectInput
                    id={field.id}
                    value={field.value}
                    onValueChange={field.onChange}
                    aria-describedby={field.inputDescribedById}
                    aria-invalid={Boolean(field.error)}
                    placeholder="Select data to export"
                    options={exportSourceOptions.map((option) => {
                      if (option.unavailable) {
                        return {
                          value: option.value,
                          label: `${option.label} (not available on this deployment)`,
                          disabled: true as const,
                          disabledReason: "Not available on this deployment.",
                        };
                      }

                      return { value: option.value, label: option.label };
                    })}
                  />
                )}
              </FormField>
            )}
          </CustomTooltip>
        ) : null}
        {!watchedValidation.ok ? (
          <Alert variant="destructive">
            <Alert.Title>
              Saved export source is no longer available
            </Alert.Title>
            <Alert.Description>
              {getExportSourceUnavailableMessage(watchedValidation.reason)}
            </Alert.Description>
          </Alert>
        ) : null}
        <FormField control={form.control} name="enabled" label="Enabled">
          {(field) => (
            <Switch
              id={field.id}
              name={field.name}
              checked={field.value}
              onBlur={field.onBlur}
              onCheckedChange={field.onChange}
              ref={field.ref}
              aria-describedby={field.inputDescribedById}
              aria-invalid={Boolean(field.error)}
            />
          )}
        </FormField>
      </form>
      <div className="flex gap-2">
        <Button
          text="Save"
          loading={actionState === "saving"}
          onClick={form.handleSubmit(onSubmit)}
        />
        <ConfirmationDialogController
          title="Reset PostHog integration?"
          text="This resets the PostHog integration for this project."
          confirmLabel="Reset integration"
          variant="destructive"
          disabled={configurationState === "new"}
          loading={actionState === "resetting"}
          error={resetError}
          onConfirm={onReset}
        >
          {({ openDialog }) => (
            <Button
              text="Reset"
              variant="ghost"
              disabled={configurationState === "new"}
              onClick={openDialog}
            />
          )}
        </ConfirmationDialogController>
      </div>
    </div>
  );
}
