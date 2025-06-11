import { useRouter } from "next/router";
import { ActionButton } from "@/src/components/ActionButton";
import Page from "@/src/components/layouts/page";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { PromptTable } from "@/src/features/prompts/components/prompts-table";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { PlusIcon } from "lucide-react";
import { api } from "@/src/utils/api";
import { PromptsOnboarding } from "@/src/components/onboarding/PromptsOnboarding";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { PromptDetail } from "@/src/features/prompts/components/prompt-detail";
import PromptMetrics from "./prompt-metrics";

export default function PromptsWithFolder() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const folderSegments = router.query.folder as string[] | undefined;
  const isMetricsPage = folderSegments?.slice(-1)[0] === 'metrics';
  // If going to metrics page, omit the last "metrics" segment for the actual prompt name/path
  const promptNamePath = isMetricsPage
    ? folderSegments?.slice(0, -1).join('/') || ''
    : folderSegments?.join('/') || '';
  const capture = usePostHogClientCapture();
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "prompts:CUD",
  });
  const promptLimit = useEntitlementLimit("prompt-management-count-prompts");

  // Check if the project has any prompts
  const { data: hasAnyPrompt, isLoading } = api.prompts.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  // TODO: don't check this when just navigating the folder structure, or is this cached anyway?
  const { data: count } = api.prompts.count.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  // Check if the current path is an actual prompt (not a folder)
  const { data: promptData, isLoading: isCheckingPrompt } = api.prompts.allVersions.useQuery(
    {
      projectId,
      name: promptNamePath,
    },
    {
      enabled: Boolean(projectId && promptNamePath),
      retry: false, // Don't retry on 404
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );
  // Determine if current path is a folder (no prompt versions found) or an actual prompt
  const isFolder = !promptData || promptData.promptVersions.length === 0;

  const showOnboarding = !isLoading && !hasAnyPrompt;

  const pageTitle = "Prompts";

  // Decide what to render: metrics, detail, or folder view
  if (promptNamePath && !isCheckingPrompt) {
    if (!isFolder) {
      if (isMetricsPage) {
        return <PromptMetrics />;
      }
      return <PromptDetail />;
    }
  }

  return (
    <Page
      headerProps={{
        title: pageTitle,
        help: {
          description:
            "Manage and version your prompts in Langfuse. Edit and update them via the UI and SDK. Retrieve the production version via the SDKs. Learn more in the docs.",
          href: "https://langfuse.com/docs/prompts",
        },
        actionButtonsRight: (
          <ActionButton
            icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
            hasAccess={hasCUDAccess}
            href={`/project/${projectId}/prompts/new${promptNamePath ? `?folder=${encodeURIComponent(promptNamePath)}` : ''}`}
            variant="default"
            limit={promptLimit}
            limitValue={Number(count?.totalCount ?? 0)}
            onClick={() => {
              capture("prompts:new_form_open");
            }}
          >
            New prompt
          </ActionButton>
        ),
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if project has no prompts */}
      {showOnboarding ? (
        <PromptsOnboarding projectId={projectId} />
      ) : (
        <PromptTable currentFolderPath={promptNamePath} />
      )}
    </Page>
  );
}
