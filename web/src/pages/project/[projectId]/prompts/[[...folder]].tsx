import { useRouter } from "next/router";
import { ActionButton } from "@/src/components/ActionButton";
import Page from "@/src/components/layouts/page";
import { PromptTable } from "@/src/features/prompts/components/prompts-table";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Download, UploadIcon, PlusIcon } from "lucide-react";
import { api } from "@/src/utils/api";
import { PromptsOnboarding } from "@/src/components/onboarding/PromptsOnboarding";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { PromptDetail } from "@/src/features/prompts/components/prompt-detail";
import PromptMetrics from "./metrics";
import { useQueryParams, StringParam } from "use-query-params";
import { useState } from "react";
import { AutomationButton } from "@/src/features/automations/components/AutomationButton";
import { ImportPromptsButtonDialogController } from "@/src/features/prompts/components/ImportPromptsButtonDialogController";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { toast } from "sonner";

export default function PromptsWithFolder() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const routeSegments = router.query.folder;
  const [queryParams] = useQueryParams({ folder: StringParam });
  const folderQueryParam = queryParams.folder || "";

  // Determine view type based on route segments
  // NOTE: there is a bug here, that if the user directly accesses a prompt name which ends in `/metrics`,
  // the prompt metrics page will be shown for a non-existing prompt name. Doesn't happen if the user clicks
  // this in the UI (we URL encode here and don't strip metrics). We could resolve this with another API call
  // to check the prompt name existence.
  const segmentsArray = Array.isArray(routeSegments) ? routeSegments : [];
  const isMetricsPage =
    segmentsArray.length > 0 &&
    segmentsArray[segmentsArray.length - 1] === "metrics";
  const promptNameFromRoute =
    segmentsArray.length > 0
      ? isMetricsPage
        ? segmentsArray.slice(0, -1).join("/")
        : segmentsArray.join("/")
      : "";

  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "prompts:CUD",
  });
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "prompts:read",
  });
  const promptLimit = useEntitlementLimit("prompt-management-count-prompts");
  const utils = api.useUtils();
  const [isExporting, setIsExporting] = useState(false);
  const capture = usePostHogClientCapture();

  const handleExport = async (mode: "latest" | "all") => {
    setIsExporting(true);
    try {
      const data = await utils.prompts.exportAll.fetch({
        projectId,
        includeAllVersions: mode === "all",
      });
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `langfuse-prompts-${mode}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      capture("prompts:bulk_export", { mode });
    } catch {
      toast.error("Failed to export prompts. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

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
      enabled: !!projectId && !promptNameFromRoute, // Only count when on folder view
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const showOnboarding = !isLoading && !hasAnyPrompt;

  // Decide what to render: metrics, detail, or folder view
  if (promptNameFromRoute.length > 0) {
    if (isMetricsPage) {
      return <PromptMetrics promptName={promptNameFromRoute} />;
    }
    return <PromptDetail promptName={promptNameFromRoute} />;
  }

  return (
    <Page
      headerProps={{
        title: "Prompts",
        help: {
          description:
            "Manage and version your prompts in Langfuse. Edit and update them via the UI and SDK. Retrieve the production version via the SDKs. Learn more in the docs.",
          href: "https://langfuse.com/docs/prompt-management/get-started",
        },
        actionButtonsRight: (
          <>
            {projectId && <AutomationButton projectId={projectId} />}
            {hasReadAccess && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={isExporting}>
                    <UploadIcon className="mr-1 h-4 w-4" />
                    {isExporting ? "Exporting…" : "Export"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport("latest")}>
                    Latest version per prompt
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("all")}>
                    All versions
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {projectId && (
              <ImportPromptsButtonDialogController projectId={projectId}>
                {({ disabled, openDialog }) => (
                  <Button
                    variant="outline"
                    disabled={Boolean(disabled)}
                    title={disabled?.reason}
                    onClick={openDialog}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    Import
                  </Button>
                )}
              </ImportPromptsButtonDialogController>
            )}
            <ActionButton
              icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
              hasAccess={hasCUDAccess}
              href={`/project/${projectId}/prompts/new${folderQueryParam ? `?folder=${encodeURIComponent(folderQueryParam)}` : ""}`}
              trackingEventName="prompts:new_form_open"
              variant="default"
              usageLimit={
                typeof promptLimit === "number"
                  ? {
                      current: Number(count?.totalCount ?? 0),
                      max: promptLimit,
                    }
                  : undefined
              }
            >
              New prompt
            </ActionButton>
          </>
        ),
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if project has no prompts */}
      {showOnboarding ? (
        <PromptsOnboarding projectId={projectId} />
      ) : (
        <PromptTable key={folderQueryParam} />
      )}
    </Page>
  );
}
