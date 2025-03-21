import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { ApiKeyRender } from "@/src/features/public-api/components/CreateApiKeyButton";
import { QuickstartExamples } from "@/src/features/public-api/components/QuickstartExamples";
import Page from "@/src/components/layouts/page";
import { type RouterOutput } from "@/src/utils/types";

export default function SetupTracingPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const { data: hasAnyTrace } = api.traces.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      refetchInterval: 5 * 60 * 1000,
      staleTime: 5 * 60 * 1000,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const [apiKeys, setApiKeys] = useState<
    RouterOutput["apiKeys"]["create"] | null
  >(null);
  const utils = api.useUtils();
  const mutCreateApiKey = api.apiKeys.create.useMutation({
    onSuccess: (data) => {
      utils.apiKeys.invalidate();
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
    <Page
      headerProps={{
        title: "Setup Tracing",
        help: {
          description: "Configure tracing for your Langfuse project",
          href: "https://langfuse.com/docs/tracing",
        },
        breadcrumb: [
          { name: "Projects", href: "/projects" },
          { name: "Setup", href: `/project/${projectId}/setup` },
          { name: "Tracing" },
        ],
      }}
      withPadding
    >
      <div className="space-y-8">
        <div>
          <h2 className="mb-2 text-xl font-semibold">API Keys</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            These keys are used to authenticate your API requests. You can
            create more keys later in the project settings.
          </p>
          {apiKeys ? (
            <ApiKeyRender generatedKeys={apiKeys} />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                You need to create an API key to start tracing your application.
              </p>
              <Button
                onClick={createApiKey}
                loading={mutCreateApiKey.isLoading}
                className="self-start"
              >
                Create API Key
              </Button>
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">
            Setup Tracing {hasAnyTrace ? "(Active)" : "(Pending)"}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Tracing is used to track and analyze your LLM calls. You can always
            skip this step and setup tracing later.
          </p>
          <QuickstartExamples
            secretKey={apiKeys?.secretKey}
            publicKey={apiKeys?.publicKey}
          />
        </div>
      </div>
    </Page>
  );
}
