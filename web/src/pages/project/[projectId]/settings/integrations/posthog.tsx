import { PostHogLogo } from "@/src/components/PosthogLogo";
import Header from "@/src/components/layouts/header";
import ContainerPage from "@/src/components/layouts/container-page";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/src/components/ui/tooltip";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { posthogIntegrationFormSchema } from "@/src/features/posthog-integration/types";
import { PostHogStatusSection } from "@/src/features/posthog-integration/components/PostHogStatusSection";
import {
  LEGACY_ANALYTICS_EXPORTER_CUTOFF,
  validateExportSource,
  type V4WriteMode,
  type ExportSourceContext,
} from "@langfuse/shared";
import { Alert } from "@/src/components/design-system/Alert/Alert";
// Shared export-source UI adapters; policy in export-source-policy.ts.
import {
  buildExportSourceContext,
  getExportSourceFieldState,
  getExportSourceUnavailableMessage,
  isExportSourceSelectable,
} from "@/src/features/analytics-integrations/exportSource";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "@/src/components/ui/card";
import { IntegrationSettingsSkeleton } from "@/src/features/analytics-integrations/components/IntegrationSettingsSkeleton";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { type z } from "zod";
import { Info, ExternalLink } from "lucide-react";

export default function PosthogIntegrationSettings() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const state = api.posthogIntegration.get.useQuery(
    { projectId },
    {
      enabled: hasAccess,
    },
  );

  const { project } = useQueryProject();

  // A persisted fault outranks active/inactive: it is the state the admin has
  // to act on, and it is cleared by the next successful sync.
  const status =
    state.isLoading || !hasAccess
      ? undefined
      : state.data?.config?.lastError
        ? "error"
        : state.data?.config?.enabled
          ? "active"
          : "inactive";

  return (
    <ContainerPage
      headerProps={{
        title: "PostHog Integration",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
        actionButtonsLeft: <>{status && <StatusBadge type={status} />}</>,
        actionButtonsRight: (
          <Button asChild variant="secondary">
            <Link href="https://langfuse.com/integrations/analytics/posthog">
              Integration Docs ↗
            </Link>
          </Button>
        ),
      }}
    >
      <p className="text-primary mb-4 text-sm">
        We have teamed up with{" "}
        <Link href="https://posthog.com" className="underline">
          PostHog
        </Link>{" "}
        (OSS product analytics) to make Langfuse events/metrics available in
        your PostHog dashboards. Upon activation, all historical data from your
        project will be synced. After the initial sync, new data is
        automatically synced every hour to keep your PostHog dashboards up to
        date.
      </p>
      {!hasAccess && (
        <p className="text-sm">
          You current role does not grant you access to these settings, please
          reach out to your project admin or owner.
        </p>
      )}
      {hasAccess && (
        <>
          <Header title="Configuration" />
          <Card className="p-3">
            <PostHogLogo className="text-foreground mb-4 w-36" />
            {!state.data || !project ? (
              <IntegrationSettingsSkeleton />
            ) : (
              <PostHogIntegrationSettings
                // Draft lifetime = entity identity, so background refetches
                // cannot reset a draft in progress.
                key={`${projectId}:${state.data.config ? "configured" : "new"}`}
                state={state.data.config ?? undefined}
                projectId={projectId}
                writeMode={state.data.writeMode}
                projectCreatedAt={project.createdAt}
              />
            )}
          </Card>
        </>
      )}
      {state.data?.config && (
        <PostHogStatusSection config={state.data.config} />
      )}
    </ContainerPage>
  );
}

const PostHogIntegrationSettings = ({
  state,
  projectId,
  writeMode,
  projectCreatedAt,
}: {
  state?: NonNullable<RouterOutput["posthogIntegration"]["get"]["config"]>;
  projectId: string;
  writeMode: V4WriteMode;
  // Raw ISO string, not a Date: a Date built in the parent's JSX would be a new
  // reference on every render and would defeat the memo below.
  projectCreatedAt: string;
}) => {
  const capture = usePostHogClientCapture();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const integrationCreatedAt = state?.createdAt;
  const exportSourceCtx: ExportSourceContext = useMemo(
    () =>
      buildExportSourceContext({
        writeMode,
        isCloud: isLangfuseCloud,
        projectCreatedAt: new Date(projectCreatedAt),
        integrationCreatedAt: integrationCreatedAt
          ? new Date(integrationCreatedAt)
          : null,
        exporterCutoff: LEGACY_ANALYTICS_EXPORTER_CUTOFF,
      }),
    [writeMode, isLangfuseCloud, projectCreatedAt, integrationCreatedAt],
  );
  const {
    options: exportSourceOptions,
    showField: showExportSourceField,
    defaultValue: defaultExportSource,
  } = getExportSourceFieldState(state?.exportSource, exportSourceCtx);

  // Blocked-save validation instead of silent rewrite.
  const formSchema = useMemo(
    () =>
      posthogIntegrationFormSchema.superRefine((data, ctx) => {
        // The credential is write-only: blank keeps the saved key, so it is
        // only required when no integration exists yet.
        if (!state && !data.posthogProjectApiKey) {
          ctx.addIssue({
            code: "custom",
            path: ["posthogProjectApiKey"],
            message: "PostHog Project API Key is required",
          });
        }
        if (!isExportSourceSelectable(data.exportSource, exportSourceCtx)) {
          ctx.addIssue({
            code: "custom",
            path: ["exportSource"],
            message:
              "This export source is not available on this deployment. Select an available export source to save.",
          });
        }
      }),
    [exportSourceCtx, state],
  );

  const posthogForm = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      posthogHostname: state?.posthogHostName ?? "",
      posthogProjectApiKey: "",
      enabled: state?.enabled ?? false,
      exportSource: defaultExportSource,
    },
  });

  const watchedExportSource = posthogForm.watch("exportSource");
  const watchedValidation =
    watchedExportSource != null
      ? validateExportSource(watchedExportSource, exportSourceCtx)
      : ({ ok: true } as const);

  const utils = api.useUtils();
  const mut = api.posthogIntegration.update.useMutation({
    onSuccess: () => {
      utils.posthogIntegration.invalidate();
    },
  });
  const mutDelete = api.posthogIntegration.delete.useMutation({
    onSuccess: () => {
      utils.posthogIntegration.invalidate();
    },
  });

  async function onSubmit(
    values: z.infer<typeof posthogIntegrationFormSchema>,
  ) {
    capture("integrations:posthog_form_submitted");
    mut.mutate({
      projectId,
      ...values,
    });
  }

  return (
    <Form {...posthogForm}>
      <form className="space-y-3" onSubmit={posthogForm.handleSubmit(onSubmit)}>
        <FormField
          control={posthogForm.control}
          name="posthogHostname"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Posthog Hostname</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                US region: https://us.posthog.com; EU region:
                https://eu.posthog.com
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={posthogForm.control}
          name="posthogProjectApiKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Posthog Project API Key</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  placeholder={state?.posthogApiKeyDisplay}
                />
              </FormControl>
              {state && (
                <FormDescription>
                  Leave blank to keep the current API key.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        {showExportSourceField && (
          <FormField
            control={posthogForm.control}
            name="exportSource"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5 pt-2">
                  Export Source
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="text-muted-foreground h-3.5 w-3.5" />
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="max-w-[350px] space-y-2 p-3"
                    >
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
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select data to export" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {exportSourceOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={option.unavailable}
                      >
                        {option.unavailable
                          ? `${option.label} (not available on this deployment)`
                          : option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Choose which data sources to export to PostHog. Scores are
                  always included.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {!watchedValidation.ok && (
          <Alert variant="destructive">
            <Alert.Title>
              Saved export source is no longer available
            </Alert.Title>
            <Alert.Description>
              {getExportSourceUnavailableMessage(watchedValidation.reason)}
            </Alert.Description>
          </Alert>
        )}
        <FormField
          control={posthogForm.control}
          name="enabled"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Enabled</FormLabel>
              <FormControl>
                <div className="mt-1 ml-4">
                  <Switch
                    id="posthog-integration-enabled"
                    checked={field.value}
                    onCheckedChange={() => {
                      field.onChange(!field.value);
                    }}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
      <div className="mt-8 flex gap-2">
        <Button
          loading={mut.isPending}
          onClick={posthogForm.handleSubmit(onSubmit)}
        >
          Save
        </Button>
        <Button
          variant="ghost"
          loading={mutDelete.isPending}
          disabled={!state}
          onClick={() => {
            if (
              confirm(
                "Are you sure you want to reset the PostHog integration for this project?",
              )
            )
              mutDelete.mutate({ projectId });
          }}
        >
          Reset
        </Button>
      </div>
    </Form>
  );
};
