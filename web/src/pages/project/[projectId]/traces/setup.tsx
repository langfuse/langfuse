import React, { useEffect } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import ContainerPage from "@/src/components/layouts/container-page";
import { ActionButton } from "@/src/components/ActionButton";
import { SubHeader } from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { ApiKeyRender } from "@/src/features/public-api/components/CreateApiKeyButton";
import { type RouterOutput } from "@/src/utils/types";
import { useState } from "react";

const TracingSetup = ({
  projectId,
  hasTracingConfigured,
}: {
  projectId: string;
  hasTracingConfigured?: boolean;
}) => {
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
      console.error("Error creating API key:", error);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <SubHeader title="1. Get API Keys" />
        <p className="text-sm text-muted-foreground">
          These keys are used to authenticate your API requests. You can create
          more keys later in the project settings.
        </p>
        {apiKeys ? (
          <ApiKeyRender
            generatedKeys={apiKeys}
            scope={"project"}
            className="mt-4"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              You need to create an API key to start tracing your application.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={createApiKey}
                loading={mutCreateApiKey.isPending}
                className="self-start"
              >
                Create new API key
              </Button>
              <ActionButton
                href={`/project/${projectId}/settings/api-keys`}
                variant="secondary"
              >
                Manage API keys
              </ActionButton>
            </div>
          </div>
        )}
      </div>

      <div>
        <SubHeader
          title="2. Instrument Your Application"
          status={hasTracingConfigured ? "active" : "pending"}
        />
        <p className="mb-4 text-sm text-muted-foreground">
          Langfuse uses OpenTelemetry to instrument your application. You can
          use one of our SDKs or framework integrations. Please follow the
          quickstart in the documentaiton to get started.
        </p>
        <ActionButton href="https://langfuse.com/docs/observability/get-started">
          Instrumentation Quickstart
        </ActionButton>
      </div>
    </div>
  );
};

export default function TracesSetupPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // Check if the user has tracing configured
  const { data: hasTracingConfigured } =
    api.traces.hasTracingConfigured.useQuery(
      { projectId },
      {
        enabled: !!projectId,
        refetchInterval: 5000,
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
        title: "Tracing Setup",
        help: {
          description:
            "Setup tracing to track and analyze your LLM calls. You can create API keys and integrate Langfuse with your application.",
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
