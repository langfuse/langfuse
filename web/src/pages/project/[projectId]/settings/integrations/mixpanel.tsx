import { MixpanelLogo } from "@/src/components/MixpanelLogo";
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
import {
  mixpanelIntegrationFormSchema,
  MIXPANEL_REGIONS,
  type MixpanelRegion,
} from "@/src/features/mixpanel-integration/types";
import {
  LEGACY_ANALYTICS_EXPORTER_CUTOFF,
  validateExportSource,
  type V4WriteMode,
  type ExportSourceContext,
} from "@langfuse/shared";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
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
import { useTranslations } from "next-intl";

export default function MixpanelIntegrationSettings() {
  const t = useTranslations("integrationsSettings");
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const state = api.mixpanelIntegration.get.useQuery(
    { projectId },
    {
      enabled: hasAccess,
    },
  );

  const { project } = useQueryProject();

  const status =
    state.isLoading || !hasAccess
      ? undefined
      : state.data?.config?.enabled
        ? "active"
        : "inactive";

  return (
    <ContainerPage
      headerProps={{
        title: t("mixpanel.title"),
        breadcrumb: [
          {
            name: t("common.settings"),
            href: `/project/${projectId}/settings`,
          },
        ],
        actionButtonsLeft: <>{status && <StatusBadge type={status} />}</>,
        actionButtonsRight: (
          <Button asChild variant="secondary">
            <Link href="https://langfuse.com/integrations/analytics/mixpanel">
              {t("common.integrationDocs")}
            </Link>
          </Button>
        ),
      }}
    >
      <p className="text-primary mb-4 text-sm">
        {t.rich("mixpanel.description", {
          link: (chunks) => (
            <Link href="https://mixpanel.com" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
      {!hasAccess && <p className="text-sm">{t("common.accessDenied")}</p>}
      {hasAccess && (
        <>
          <Header title={t("common.configuration")} />
          <Card className="p-3">
            <MixpanelLogo className="text-foreground mb-4 w-20" />
            {!state.data || !project ? (
              <IntegrationSettingsSkeleton />
            ) : (
              <MixpanelIntegrationSettingsForm
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
      {state.data?.config?.enabled && (
        <>
          <Header title={t("common.status")} className="mt-8" />
          <p className="text-primary text-sm">
            {t("mixpanel.syncedUntil", {
              value: state.data?.config?.lastSyncAt
                ? new Date(state.data.config.lastSyncAt).toLocaleString()
                : t("common.neverPending"),
            })}
          </p>
        </>
      )}
    </ContainerPage>
  );
}

const MixpanelIntegrationSettingsForm = ({
  state,
  projectId,
  writeMode,
  projectCreatedAt,
}: {
  state?: NonNullable<RouterOutput["mixpanelIntegration"]["get"]["config"]>;
  projectId: string;
  writeMode: V4WriteMode;
  // Raw ISO string, not a Date: a Date built in the parent's JSX would be a new
  // reference on every render and would defeat the memo below.
  projectCreatedAt: string;
}) => {
  const t = useTranslations("integrationsSettings");
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
      mixpanelIntegrationFormSchema.superRefine((data, ctx) => {
        // The credential is write-only: blank keeps the saved token, so it is
        // only required when no integration exists yet.
        if (!state && !data.mixpanelProjectToken) {
          ctx.addIssue({
            code: "custom",
            path: ["mixpanelProjectToken"],
            message: t("mixpanel.tokenRequired"),
          });
        }
        if (!isExportSourceSelectable(data.exportSource, exportSourceCtx)) {
          ctx.addIssue({
            code: "custom",
            path: ["exportSource"],
            message: t("blobStorage.validationUnavailable"),
          });
        }
      }),
    [exportSourceCtx, state, t],
  );

  const mixpanelForm = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mixpanelRegion:
        (state?.mixpanelRegion as MixpanelRegion) ??
        MIXPANEL_REGIONS[0].subdomain,
      mixpanelProjectToken: "",
      enabled: state?.enabled ?? false,
      exportSource: defaultExportSource,
    },
  });

  const watchedExportSource = mixpanelForm.watch("exportSource");
  const watchedValidation =
    watchedExportSource != null
      ? validateExportSource(watchedExportSource, exportSourceCtx)
      : ({ ok: true } as const);

  const utils = api.useUtils();
  const mut = api.mixpanelIntegration.update.useMutation({
    onSuccess: () => {
      utils.mixpanelIntegration.invalidate();
    },
  });
  const mutDelete = api.mixpanelIntegration.delete.useMutation({
    onSuccess: () => {
      utils.mixpanelIntegration.invalidate();
    },
  });

  async function onSubmit(
    values: z.infer<typeof mixpanelIntegrationFormSchema>,
  ) {
    capture("integrations:mixpanel_form_submitted");
    mut.mutate({
      projectId,
      ...values,
    });
  }

  return (
    <Form {...mixpanelForm}>
      <form
        className="space-y-3"
        onSubmit={mixpanelForm.handleSubmit(onSubmit)}
      >
        <FormField
          control={mixpanelForm.control}
          name="mixpanelRegion"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("mixpanel.region")}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t("mixpanel.selectRegion")} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {MIXPANEL_REGIONS.map((region) => (
                    <SelectItem key={region.subdomain} value={region.subdomain}>
                      {region.subdomain === "api"
                        ? t("mixpanel.regions.us")
                        : region.subdomain === "api-eu"
                          ? t("mixpanel.regions.eu")
                          : t("mixpanel.regions.india")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {t("mixpanel.regionDescription")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={mixpanelForm.control}
          name="mixpanelProjectToken"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("mixpanel.projectToken")}</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  placeholder={state?.mixpanelProjectTokenDisplay}
                />
              </FormControl>
              <FormDescription>
                {state ? t("mixpanel.keepToken") : t("mixpanel.tokenHelp")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {showExportSourceField && (
          <FormField
            control={mixpanelForm.control}
            name="exportSource"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5 pt-2">
                  {t("common.exportSource")}
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
                          {t("common.furtherInformation")}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("common.selectExportSource")}
                      />
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
                          ? t("common.unavailableOption", {
                              label: option.label,
                            })
                          : option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {t("mixpanel.sourceDescription")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {!watchedValidation.ok && (
          <Alert variant="destructive">
            <AlertTitle>{t("common.unavailableTitle")}</AlertTitle>
            <AlertDescription>
              {getExportSourceUnavailableMessage(watchedValidation.reason)}
            </AlertDescription>
          </Alert>
        )}
        <FormField
          control={mixpanelForm.control}
          name="enabled"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("common.enabled")}</FormLabel>
              <FormControl>
                <div className="mt-1 ml-4">
                  <Switch
                    id="mixpanel-integration-enabled"
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
          onClick={mixpanelForm.handleSubmit(onSubmit)}
        >
          {t("common.save")}
        </Button>
        <Button
          variant="ghost"
          loading={mutDelete.isPending}
          disabled={!state}
          onClick={() => {
            if (confirm(t("mixpanel.resetConfirm")))
              mutDelete.mutate({ projectId });
          }}
        >
          {t("common.reset")}
        </Button>
      </div>
    </Form>
  );
};
