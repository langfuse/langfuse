import { ActionButton } from "@/src/components/ActionButton";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { SplashScreen } from "@/src/components/ui/splash-screen";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { ApiKeyRender } from "@/src/features/public-api/components/CreateApiKeyButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Check, Copy, LockIcon, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

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
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(value);
      onCopy?.();
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {
      toast.error("Failed to copy to clipboard");
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
        onClick={() => void handleCopy()}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy prompt"}
      </Button>
    </div>
  );
}

export function TracesSetupOnboardingCard({
  projectId,
}: {
  projectId: string;
}) {
  const capture = usePostHogClientCapture();
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
    try {
      await mutCreateApiKey.mutateAsync({ projectId });
    } catch (error) {
      console.error("Error creating API key:", error);
      toast.error("Failed to create API key");
    }
  };

  return (
    <SplashScreen
      waitingFor="Waiting for first trace"
      title="Time to log your first trace, it only takes a minute"
      description="Get your API keys first, then ask your coding agent to add observability with Langfuse to your application."
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/traces-overview-v1.mp4"
      videoPosition="bottom"
      steps={[
        {
          title: "Create API keys",
          description:
            "Your application needs API keys to send traces to Langfuse.",
          content: apiKeys ? (
            <ApiKeyRender
              generatedKeys={apiKeys}
              scope="project"
              className="mt-1"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {hasApiKeyCreateAccess ? (
                <Button
                  onClick={createApiKey}
                  loading={mutCreateApiKey.isPending}
                  className="self-start"
                >
                  Create new API key
                </Button>
              ) : (
                <Button disabled className="self-start">
                  <LockIcon
                    className="mr-2 -ml-0.5 h-4 w-4"
                    aria-hidden="true"
                  />
                  Create new API key
                </Button>
              )}
              <ActionButton
                href={`/project/${projectId}/settings/api-keys`}
                variant="secondary"
              >
                Manage API keys
              </ActionButton>
            </div>
          ),
        },
        {
          title: "Add tracing with your coding agent",
          badge: (
            <Badge variant="tertiary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              Recommended
            </Badge>
          ),
          description:
            "Paste this prompt into Claude, Cursor, Copilot, or another coding agent.",
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
                  or follow our docs to set up tracing manually
                </Link>
              </div>
            </>
          ),
        },
        {
          title: "Run your app — traces will appear here",
          description:
            "Once your app makes an LLM call, traces show up within seconds.",
        },
      ]}
    />
  );
}
