import { ActionButton } from "@/src/components/ActionButton";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { ApiKeyRender } from "@/src/features/public-api/components/CreateApiKeyButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
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
  prefix,
  onCopy,
}: {
  value: string;
  prefix?: string;
  onCopy?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyTextToClipboard(value);
    onCopy?.();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div className="space-y-2">
      <div className="bg-muted/50 mx-auto flex items-start justify-between gap-3 rounded-2xl border px-5 py-4 shadow-xs">
        <code className="min-w-0 flex-1 font-mono text-xs leading-6 break-words whitespace-pre-wrap sm:text-sm">
          {prefix ? (
            <span className="text-muted-foreground mr-2 select-none">
              {prefix}
            </span>
          ) : null}
          {value}
        </code>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={() => void handleCopy()}
          aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function SkillsOnboardingCard({
  className,
  projectId,
}: {
  className?: string;
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
    <section className={cn("bg-background", className)}>
      <div className="mx-auto flex max-w-4xl flex-col px-6 py-8 sm:px-10 sm:py-10">
        <div className="mb-10 text-center">
          <StatusBadge
            type="waiting"
            showText={false}
            className="mb-4 px-3 py-1.5 text-sm"
          >
            Waiting for first trace
          </StatusBadge>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Time to log your first trace, it only takes a minute
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-3xl text-lg leading-8">
            Ask your coding agent to add observability with Langfuse to your
            application, then add your API keys to start logging traces.
          </p>
        </div>

        <div className="w-full max-w-4xl space-y-8">
          <div className="text-left">
            <div className="mb-3 flex items-center gap-3 text-left">
              <span className="text-muted-foreground text-3xl font-light">
                1
              </span>
              <h3 className="text-2xl font-semibold">
                Add tracing with your coding agent
              </h3>
              <Badge variant="tertiary" className="gap-1">
                <Sparkles className="h-3 w-3" />
                Recommended
              </Badge>
            </div>
            <p className="text-muted-foreground text-base leading-7">
              Paste this prompt into Claude, Cursor, Copilot, or another coding
              agent.
            </p>
            <div className="mt-6 w-full max-w-4xl">
              <CopyableSnippet
                value={SKILLS_INSTALL_COMMAND}
                onCopy={() =>
                  capture("onboarding:tracing_agent_prompt_copy_clicked", {
                    projectId,
                  })
                }
              />
            </div>

            <div className="mt-5 w-full max-w-4xl text-center">
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
          </div>

          <div className="border-border border-t pt-8 text-left">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-muted-foreground text-3xl font-light">
                2
              </span>
              <h3 className="text-2xl font-semibold">Get API keys</h3>
            </div>
            <p className="text-muted-foreground text-base leading-7">
              You need API keys before your application can send traces to
              Langfuse.
            </p>
            {apiKeys ? (
              <ApiKeyRender
                generatedKeys={apiKeys}
                scope="project"
                className="mt-4"
              />
            ) : (
              <div className="mt-4 flex flex-col gap-4">
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
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
