/* eslint-disable no-nested-ternary */
import { PostHogLogo } from "@/src/app/components/PosthogLogo";
import Header from "@/src/app/shell/layouts/header";
import ContainerPage from "@/src/app/shell/layouts/container-page";
import { StatusBadge } from "@/src/app/design-system/legacy-primitives/StatusBadge/StatusBadge";
import { Button } from "@/src/app/design-system/Button/Button";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import { PostHogStatusSection } from "@/src/analytics/customer-integrations/posthog/components/PostHogStatusSection";
import {
  PostHogIntegrationForm,
  type PostHogIntegrationFormValues,
} from "@/src/analytics/customer-integrations/posthog/components/PostHogIntegrationForm";
import {
  LEGACY_ANALYTICS_EXPORTER_CUTOFF,
  type V4WriteMode,
  type ExportSourceContext,
} from "@langfuse/shared";
// Shared export-source UI adapters; policy in export-source-policy.ts.
import {
  buildExportSourceContext,
  getExportSourceFormValue,
  IntegrationSettingsSkeleton,
} from "@/src/analytics/customer-integrations/common";
import { useLangfuseCloudRegion } from "@/src/identity/organizations";
import { useQueryProject } from "@/src/identity/projects";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { api } from "@/src/app/utils/api";
import { type RouterOutput } from "@/src/app/utils/types";
import { Card } from "@/src/app/design-system/legacy-primitives/card";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";

export default function PostHogIntegrationPage() {
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
  const status = (() => {
    if (state.isLoading || !hasAccess) {
      return undefined;
    }
    if (state.data?.config?.lastError) {
      return "error";
    }
    if (state.data?.config?.enabled) {
      return "active";
    }
    return "inactive";
  })();

  return (
    <ContainerPage
      headerProps={{
        title: "PostHog Integration",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
        actionButtonsLeft: <>{status && <StatusBadge type={status} />}</>,
        actionButtonsRight: (
          <Button
            href="https://langfuse.com/integrations/analytics/posthog"
            text="Integration Docs"
            variant="secondary"
          />
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
              <ConnectedPostHogIntegrationForm
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

const ConnectedPostHogIntegrationForm = ({
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
  const defaultExportSource = getExportSourceFormValue(
    state?.exportSource,
    exportSourceCtx,
  );

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

  function onSubmit(values: PostHogIntegrationFormValues) {
    capture("integrations:posthog_form_submitted");
    mut.mutate({
      projectId,
      ...values,
    });
  }

  return (
    <PostHogIntegrationForm
      actionState={
        mut.isPending ? "saving" : mutDelete.isPending ? "resetting" : "idle"
      }
      configurationState={state ? "configured" : "new"}
      defaultValues={{
        posthogHostname: state?.posthogHostName ?? "",
        posthogProjectApiKey: "",
        enabled: state?.enabled ?? false,
        exportSource: defaultExportSource,
      }}
      exportSourceContext={exportSourceCtx}
      projectApiKeyDisplay={state?.posthogApiKeyDisplay}
      resetError={mutDelete.error?.message}
      onSubmit={onSubmit}
      onReset={() => mutDelete.mutateAsync({ projectId })}
    />
  );
};
