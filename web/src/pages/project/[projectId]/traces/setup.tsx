import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import ContainerPage from "@/src/components/layouts/container-page";
import { ActionButton } from "@/src/components/ActionButton";
import { SubHeader } from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { ApiKeyDetailContent } from "@/src/features/public-api/components/ApiKeyDetailContent";
import { useLangfuseBaseUrl } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import { type RouterOutput } from "@/src/utils/types";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useTranslations } from "next-intl";

export const TracingSetup = ({
  projectId,
  hasTracingConfigured,
}: {
  projectId: string;
  hasTracingConfigured?: boolean;
}) => {
  const t = useTranslations("coreDetails.tables.traces");
  const baseUrl = useLangfuseBaseUrl();
  const [apiKeys, setApiKeys] = useState<
    RouterOutput["projectApiKeys"]["create"] | null
  >(null);
  const utils = api.useUtils();
  const mutCreateApiKey = api.projectApiKeys.create.useMutation({
    onSuccess: (data) => {
      utils.projectApiKeys.invalidate();
      setApiKeys(data);
    },
  });

  const createApiKey = async () => {
    try {
      await mutCreateApiKey.mutateAsync({ projectId });
    } catch (error) {
      reportNonTrpcError(error, "setup");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <SubHeader title={t("setupApiKeysTitle")} />
        {apiKeys ? (
          <ApiKeyDetailContent
            scope="project"
            secretKey={apiKeys.secretKey}
            publicKey={apiKeys.publicKey}
            baseUrl={baseUrl}
            className="mt-4"
            showMcpSection={false}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              {t("setupApiKeysDescription")}
            </p>
            <div className="flex gap-2">
              <Button
                onClick={createApiKey}
                loading={mutCreateApiKey.isPending}
                className="self-start"
              >
                {t("createApiKey")}
              </Button>
              <ActionButton
                href={`/project/${projectId}/settings/api-keys`}
                variant="secondary"
              >
                {t("manageApiKeys")}
              </ActionButton>
            </div>
          </div>
        )}
      </div>

      <div>
        <SubHeader
          title={t("setupInstrumentationTitle")}
          status={hasTracingConfigured ? "active" : "pending"}
        />
        <p className="text-muted-foreground mb-4 text-sm">
          {t("setupInstrumentationDescription")}
        </p>
        <ActionButton href="https://langfuse.com/docs/observability/get-started">
          {t("quickstart")}
        </ActionButton>
      </div>
    </div>
  );
};

export default function TracesSetupPage() {
  const t = useTranslations("coreDetails.tables.traces");
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { project } = useQueryProject();

  // Check if the user has tracing configured
  // Skip polling entirely if the project flag is already set in the session
  const { data: hasTracingConfigured } =
    api.traces.hasTracingConfigured.useQuery(
      { projectId },
      {
        enabled: !!projectId,
        refetchInterval: project?.hasTraces ? false : 5000,
        initialData: project?.hasTraces ? true : undefined,
        staleTime: project?.hasTraces ? Infinity : 0,
        trpc: {
          context: {
            skipBatch: true,
          },
        },
      },
    );

  const capture = usePostHogClientCapture();
  useEffect(() => {
    if (hasTracingConfigured !== undefined) {
      capture("onboarding:tracing_check_active", {
        active: hasTracingConfigured,
      });
    }
  }, [hasTracingConfigured, capture]);

  return (
    <ContainerPage
      headerProps={{
        title: t("setupTitle"),
        help: {
          description: t("setupDescription"),
          href: "https://langfuse.com/docs/observability/overview",
        },
      }}
    >
      <div className="flex flex-col gap-4">
        <TracingSetup
          projectId={projectId}
          hasTracingConfigured={hasTracingConfigured ?? false}
        />
      </div>
    </ContainerPage>
  );
}
