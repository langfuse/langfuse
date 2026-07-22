import { PostHogLogo } from "@/src/components/PosthogLogo";
import Header from "@/src/components/layouts/header";
import ContainerPage from "@/src/components/layouts/container-page";
import { StatusBadge } from "@/src/components/layouts/status-badge";
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
import { PasswordInput } from "@/src/components/ui/password-input";
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
import {
  AnalyticsIntegrationExportSource,
  validateExportSource,
  type ExportSourceContext,
} from "@langfuse/shared";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
// Shared export-source UI adapters; policy in export-source-policy.ts.
import {
  getExportSourceOptions,
  getExportSourceUnavailableMessage,
  isExportSourceSelectable,
  shouldHideExportSourceSelector,
} from "@/src/features/analytics-integrations/exportSource";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "@/src/components/ui/card";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";
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

  const status =
    state.isLoading || !hasAccess
      ? undefined
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
            <PostHogIntegrationSettings
              state={state.data?.config ?? undefined}
              projectId={projectId}
              isLoading={state.isLoading}
              legacyWritesActive={state.data?.legacyWritesActive ?? true}
            />
          </Card>
        </>
      )}
      {state.data?.config?.enabled && (
        <>
          <Header title="Status" className="mt-8" />
          <p className="text-primary text-sm">
            Data synced until:{" "}
            {state.data?.config?.lastSyncAt
              ? new Date(state.data.config.lastSyncAt).toLocaleString()
              : "Never (pending)"}
          </p>
        </>
      )}
    </ContainerPage>
  );
}

const PostHogIntegrationSettings = ({
  state,
  projectId,
  isLoading,
  legacyWritesActive,
}: {
  state?: NonNullable<RouterOutput["posthogIntegration"]["get"]["config"]>;
  projectId: string;
  isLoading: boolean;
  legacyWritesActive: boolean;
}) => {
  const capture = usePostHogClientCapture();
  const { isBetaEnabled } = useV4Beta();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { project } = useQueryProject();

  // Policy context; EVENTS is always accepted by this router, hence
  // enrichedAvailable: true (see export-source-policy.ts).
  const projectCreatedAt = project?.createdAt;
  const exportSourceCtx: ExportSourceContext = useMemo(
    () => ({
      isCloud: isLangfuseCloud,
      enrichedAvailable: true,
      legacyWritesActive,
      projectCreatedAt: projectCreatedAt
        ? new Date(projectCreatedAt)
        : undefined,
    }),
    [isLangfuseCloud, legacyWritesActive, projectCreatedAt],
  );
  const legacyValidation = validateExportSource(
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    exportSourceCtx,
  );
  // Post-cutoff Cloud projects: field hidden, form value pinned to EVENTS via
  // the default below (LFE-9688 / 9830 behavior, unchanged).
  const isPostCutoffCloud =
    !legacyValidation.ok && legacyValidation.reason === "cloud-cutoff";
  const exportSourceOptions = getExportSourceOptions(
    state?.exportSource ?? null,
    exportSourceCtx,
  );
  // Selector is beta-gated, except a persisted source blocked by capability
  // forces it visible so the blocked-save alert has something to point at.
  const persistedBlockedByCapability =
    state?.exportSource != null &&
    !isPostCutoffCloud &&
    !isExportSourceSelectable(state.exportSource, exportSourceCtx);
  const showExportSourceField =
    ((isBetaEnabled && !isPostCutoffCloud) || persistedBlockedByCapability) &&
    !shouldHideExportSourceSelector(exportSourceOptions);

  // Blocked-save validation instead of silent rewrite (LFE-10296).
  const formSchema = useMemo(
    () =>
      posthogIntegrationFormSchema.superRefine((data, ctx) => {
        if (!isExportSourceSelectable(data.exportSource, exportSourceCtx)) {
          ctx.addIssue({
            code: "custom",
            path: ["exportSource"],
            message:
              "This export source is not available on this deployment. Select an available export source to save.",
          });
        }
      }),
    [exportSourceCtx],
  );

  const defaultExportSource = isPostCutoffCloud
    ? AnalyticsIntegrationExportSource.EVENTS
    : (state?.exportSource ??
      (isBetaEnabled || !legacyWritesActive
        ? AnalyticsIntegrationExportSource.EVENTS
        : AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS));

  const posthogForm = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      posthogHostname: state?.posthogHostName ?? "",
      posthogProjectApiKey: state?.posthogApiKey ?? "",
      enabled: state?.enabled ?? false,
      exportSource: defaultExportSource,
    },
    disabled: isLoading,
  });

  useEffect(() => {
    posthogForm.reset({
      posthogHostname: state?.posthogHostName ?? "",
      posthogProjectApiKey: state?.posthogApiKey ?? "",
      enabled: state?.enabled ?? false,
      exportSource: defaultExportSource,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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
                <PasswordInput {...field} />
              </FormControl>
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
            <AlertTitle>Saved export source is no longer available</AlertTitle>
            <AlertDescription>
              {getExportSourceUnavailableMessage(watchedValidation.reason)}
            </AlertDescription>
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
          disabled={isLoading}
        >
          Save
        </Button>
        <Button
          variant="ghost"
          loading={mutDelete.isPending}
          disabled={isLoading || !!!state}
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
