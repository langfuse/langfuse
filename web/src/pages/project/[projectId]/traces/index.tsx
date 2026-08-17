import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import TracesTable from "@/src/components/table/use-cases/traces";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { TracesOnboarding } from "@/src/components/onboarding/TracesOnboarding";
import {
  getTracingTabs,
  TRACING_TABS,
} from "@/src/features/navigation/utils/tracing-tabs";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import ObservationsEventsTable from "@/src/features/events/components/EventsTable";
import { useQueryProject } from "@/src/features/projects/hooks";
import { V4MigrationDelayBadge } from "@/src/features/v4-migration/V4MigrationDelayBadge";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { TracingAIFeatureOptInDialog } from "@/src/features/setup/components/TracingAIFeatureOptInDialog";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

const AI_OPT_IN_DISMISS_KEY_PREFIX = "langfuse:tracing-ai-opt-in-dismissed";
const DEBUG_LOG_ENDPOINT = "/api/internal/tracing-ai-opt-in-debug-log";

const getAiOptInDismissKey = (organizationId: string) =>
  `${AI_OPT_IN_DISMISS_KEY_PREFIX}:${organizationId}`;

const emitDebugLog = (
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
) => {
  if (typeof window === "undefined") {
    return;
  }

  fetch(DEBUG_LOG_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
};

const hasDismissedAiOptIn = (organizationId: string) => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const dismissKey = getAiOptInDismissKey(organizationId);
    const isDismissed = localStorage.getItem(dismissKey) === "true";
    // #region agent log
    emitDebugLog(
      "B",
      "traces/index.tsx:hasDismissedAiOptIn",
      "Read AI opt-in dismissal from localStorage",
      { organizationId, dismissKey, isDismissed },
    );
    // #endregion
    return isDismissed;
  } catch {
    return false;
  }
};

const markAiOptInDismissed = (organizationId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const dismissKey = getAiOptInDismissKey(organizationId);
    // #region agent log
    emitDebugLog(
      "C",
      "traces/index.tsx:markAiOptInDismissed:before",
      "Writing AI opt-in dismissal to localStorage",
      { organizationId, dismissKey },
    );
    // #endregion
    localStorage.setItem(dismissKey, "true");
    // #region agent log
    emitDebugLog(
      "C",
      "traces/index.tsx:markAiOptInDismissed:after",
      "Wrote AI opt-in dismissal to localStorage",
      {
        organizationId,
        dismissKey,
        storedValue: localStorage.getItem(dismissKey),
      },
    );
    // #endregion
  } catch {
    // Ignore localStorage write failures and keep onboarding usable.
  }
};

export default function Traces() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const projectId = router.query.projectId as string;
  const { isBetaEnabled, isInitializing } = useV4Beta();
  const { project, organization } = useQueryProject();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const [showAiOptInDialog, setShowAiOptInDialog] = useState(false);

  // Check if the user has tracing configured
  // Skip polling entirely if the project flag is already set in the session
  const { data: hasTracingConfigured, isLoading } =
    api.traces.hasTracingConfigured.useQuery(
      { projectId },
      {
        enabled: !!projectId,
        trpc: {
          context: {
            skipBatch: true,
          },
        },
        refetchInterval: project?.hasTraces ? false : 10_000,
        initialData: project?.hasTraces ? true : undefined,
        staleTime: project?.hasTraces ? Infinity : 0,
      },
    );

  const showOnboarding = !isLoading && !hasTracingConfigured;
  const hasOrganizationUpdateAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organization:update",
  });
  const shouldPromptForAiOptIn =
    showOnboarding &&
    isLangfuseCloud &&
    Boolean(organization?.id) &&
    !organization?.aiFeaturesEnabled;

  const updateAiFeaturesMutation = api.organizations.update.useMutation();

  useEffect(() => {
    // #region agent log
    emitDebugLog(
      "D",
      "traces/index.tsx:useEffect:shouldPromptForAiOptIn",
      "Evaluating AI opt-in dialog visibility",
      {
        shouldPromptForAiOptIn,
        organizationId: organization?.id ?? null,
      },
    );
    // #endregion
    if (!shouldPromptForAiOptIn || !organization?.id) {
      setShowAiOptInDialog(false);
      return;
    }

    setShowAiOptInDialog(!hasDismissedAiOptIn(organization.id));
  }, [organization?.id, shouldPromptForAiOptIn]);

  const dismissAiOptInDialog = useCallback(() => {
    // #region agent log
    emitDebugLog(
      "A",
      "traces/index.tsx:dismissAiOptInDialog",
      "Dismiss handler invoked",
      {
        organizationId: organization?.id ?? null,
        hasOrganizationUpdateAccess,
      },
    );
    // #endregion
    if (organization?.id) {
      markAiOptInDismissed(organization.id);
    }

    capture("onboarding:tracing_ai_opt_in_not_now_clicked", {
      hasOrganizationUpdateAccess,
    });
    setShowAiOptInDialog(false);
  }, [capture, hasOrganizationUpdateAccess, organization?.id]);

  const enableAiFeatures = useCallback(async () => {
    if (
      !organization?.id ||
      !hasOrganizationUpdateAccess ||
      updateAiFeaturesMutation.isPending
    ) {
      return;
    }

    try {
      await updateAiFeaturesMutation.mutateAsync({
        orgId: organization.id,
        aiFeaturesEnabled: true,
      });
      await updateSession();
      await utils.organizations.byId.invalidate();
      markAiOptInDismissed(organization.id);
      setShowAiOptInDialog(false);
      capture("onboarding:tracing_ai_opt_in_enabled");
    } catch (error) {
      showErrorToast(
        "Failed to enable AI features",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }, [
    capture,
    hasOrganizationUpdateAccess,
    organization?.id,
    updateAiFeaturesMutation,
    updateSession,
    utils.organizations.byId,
  ]);

  const aiOptInDialog = (
    <TracingAIFeatureOptInDialog
      open={showAiOptInDialog}
      isLoading={updateAiFeaturesMutation.isPending}
      hasOrganizationUpdateAccess={hasOrganizationUpdateAccess}
      organizationId={organization?.id}
      onClose={dismissAiOptInDialog}
      onEnableAiFeatures={enableAiFeatures}
    />
  );

  if (showOnboarding) {
    return (
      <Page
        headerProps={{
          title: "Tracing",
          help: {
            description:
              "A trace represents a single function/api invocation. Traces contain observations. See [docs](https://langfuse.com/docs/observability/data-model) to learn more.",
            href: "https://langfuse.com/docs/observability/data-model",
          },
        }}
        scrollable
      >
        <TracesOnboarding projectId={projectId} />
        {aiOptInDialog}
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: "Tracing",
        titleBadges: <V4MigrationDelayBadge />,
        help: {
          description: (
            <>
              A trace represents a single function/api invocation. Traces
              contain observations. See{" "}
              <a
                href="https://langfuse.com/docs/observability/data-model"
                target="_blank"
                rel="noopener noreferrer"
                className="decoration-primary/30 hover:decoration-primary underline"
                onClick={(e) => e.stopPropagation()}
              >
                docs
              </a>{" "}
              to learn more.
            </>
          ),
          href: "https://langfuse.com/docs/observability/data-model",
        },
        tabsProps:
          isBetaEnabled || isInitializing
            ? undefined
            : {
                tabs: getTracingTabs(projectId),
                activeTab: TRACING_TABS.TRACES,
              },
      }}
    >
      {isInitializing ? (
        <>
          {/* Wait for the beta flag before mounting either table. Otherwise the
              legacy table can briefly mount, restore a v3 saved view, and
              promote its viewId into the URL before the correct mode
              resolves. */}
        </>
      ) : isBetaEnabled ? (
        <ObservationsEventsTable
          projectId={projectId}
          showControlsInPageHeader
          enableAppRootDefault
        />
      ) : (
        <TracesTable projectId={projectId} showControlsInPageHeader />
      )}
      {aiOptInDialog}
    </Page>
  );
}
