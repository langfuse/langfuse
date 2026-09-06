import { ActionButton } from "@/src/components/ActionButton";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { SplashScreen } from "@/src/components/ui/splash-screen";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { ApiKeyDetailContent } from "@/src/features/public-api/components/ApiKeyDetailContent";
import { useLangfuseBaseUrl } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { Check, Copy, LockIcon, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

const SKILLS_INSTALL_COMMAND =
  "Install the Langfuse AI skill from github.com/langfuse/skills and use it to add tracing to this application with Langfuse following best practices.";
const MANUAL_TRACING_DOCS_URL =
  "https://langfuse.com/docs/observability/get-started";

function CopyableSnippet({
  value,
  onCopy,
}: {
  value: string;
  onCopy?: () => void;
}) {
  const t = useTranslations("systemUi.setupTracing");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(value);
      onCopy?.();
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  return (
    <div className="bg-muted/50 flex items-center gap-4 rounded-2xl border p-5 shadow-xs">
      <code className="min-w-0 flex-1 font-mono text-xs leading-6 break-words whitespace-pre-wrap sm:text-sm">
        {value}
      </code>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 gap-2"
        onClick={() => handleCopy()}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? t("copied") : t("copyPrompt")}
      </Button>
    </div>
  );
}

export function TracesSetupOnboardingCard({
  projectId,
}: {
  projectId: string;
}) {
  const t = useTranslations("systemUi.setupTracing");
  const capture = usePostHogClientCapture();
  const baseUrl = useLangfuseBaseUrl();
  const hasApiKeyCreateAccess = useHasProjectAccess({
    projectId,
    scope: "apiKeys:CUD",
  });
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
    capture("onboarding:tracing_api_key_create_clicked");

    try {
      await mutCreateApiKey.mutateAsync({ projectId });
    } catch (error) {
      reportNonTrpcError(error, "setup");
      toast.error(t("createKeyFailed"));
    }
  };

  return (
    <SplashScreen
      waitingFor={t("waiting")}
      title={t("title")}
      description={t("description")}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/traces-overview-v1.mp4"
      videoPosition="bottom"
      steps={[
        {
          title: t("createKeys"),
          description: t("createKeysDescription"),
          content: apiKeys ? (
            <ApiKeyDetailContent
              scope="project"
              secretKey={apiKeys.secretKey}
              publicKey={apiKeys.publicKey}
              baseUrl={baseUrl}
              className="mt-1"
              showMcpSection={false}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {hasApiKeyCreateAccess ? (
                <Button
                  onClick={createApiKey}
                  loading={mutCreateApiKey.isPending}
                  className="self-start"
                >
                  {t("createNewKey")}
                </Button>
              ) : (
                <Button disabled className="self-start">
                  <LockIcon
                    className="mr-2 -ml-0.5 h-4 w-4"
                    aria-hidden="true"
                  />
                  {t("createNewKey")}
                </Button>
              )}
              <ActionButton
                href={`/project/${projectId}/settings/api-keys`}
                variant="secondary"
              >
                {t("manageKeys")}
              </ActionButton>
            </div>
          ),
        },
        {
          title: t("agentTitle"),
          badge: (
            <Badge variant="tertiary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {t("recommended")}
            </Badge>
          ),
          description: t("agentDescription"),
          content: (
            <>
              <CopyableSnippet
                value={SKILLS_INSTALL_COMMAND}
                onCopy={() =>
                  capture("onboarding:tracing_agent_prompt_copy_clicked", {
                    projectId,
                  })
                }
              />
              <div className="mt-3">
                <Link
                  href={MANUAL_TRACING_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex text-sm underline underline-offset-4 hover:no-underline"
                  onClick={() =>
                    capture("onboarding:tracing_manual_docs_link_clicked", {
                      href: MANUAL_TRACING_DOCS_URL,
                      projectId,
                    })
                  }
                >
                  {t("manualDocs")}
                </Link>
              </div>
            </>
          ),
        },
        {
          title: t("runApp"),
          description: t("runAppDescription"),
        },
      ]}
    />
  );
}
