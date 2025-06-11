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
import { useQueryParams, StringParam } from "use-query-params";

export default function PromptsWithFolder() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const folderSegments = router.query.folder;
  const [queryParams] = useQueryParams({ folder: StringParam });
  const currentFolderPath = queryParams.folder || '';

  // Check if viewing a specific prompt (using route segments for prompt detail)
  const folderArray = Array.isArray(folderSegments) ? folderSegments : [];
  const isMetricsPage = folderArray.length > 0 && folderArray[folderArray.length - 1] === 'metrics';
  const promptNamePath = folderArray.length > 0
    ? (isMetricsPage ? folderArray.slice(0, -1).join('/') : folderArray.join('/'))
    : '';

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

  const { data: count } = api.prompts.count.useQuery(
    { projectId },
    {
      enabled: !!projectId && !promptNamePath, // Only count when on folder view
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const showOnboarding = !isLoading && !hasAnyPrompt;

  // Decide what to render: metrics, detail, or folder view
  if (promptNamePath.length > 0) {
    if (isMetricsPage) {
      return <PromptMetrics />;
    }
    return <PromptDetail />;
  }

  return (
    <Page
      headerProps={{
        title: "Prompts",
        help: {
          description:
            "Manage and version your prompts in Langfuse. Edit and update them via the UI and SDK. Retrieve the production version via the SDKs. Learn more in the docs.",
          href: "https://langfuse.com/docs/prompts",
        },
        actionButtonsRight: (
          <ActionButton
            icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
            hasAccess={hasCUDAccess}
            href={`/project/${projectId}/prompts/new${currentFolderPath ? `?folder=${encodeURIComponent(currentFolderPath)}` : ''}`}
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
        <PromptTable key={currentFolderPath} currentFolderPath={currentFolderPath} />
      )}
    </Page>
  );
}
