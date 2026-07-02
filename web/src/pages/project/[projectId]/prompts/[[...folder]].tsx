import { useRouter } from "next/router";
import { ActionButton } from "@/src/components/ActionButton";
import Page from "@/src/components/layouts/page";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { PromptTable } from "@/src/features/prompts/components/prompts-table";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { UploadIcon, PlusIcon } from "lucide-react";
import { api } from "@/src/utils/api";
import { PromptsOnboarding } from "@/src/components/onboarding/PromptsOnboarding";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { PromptDetail } from "@/src/features/prompts/components/prompt-detail";
import PromptMetrics from "./metrics";
import { useQueryParams, StringParam } from "use-query-params";
import React, { useRef, useState } from "react";
import { AutomationButton } from "@/src/features/automations/components/AutomationButton";
import { ImportPromptsButton } from "@/src/features/prompts/components/ImportPromptsDialog";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";

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

  const capture = usePostHogClientCapture();
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "prompts:CUD",
  });
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "prompts:read",
  });
  const promptLimit = useEntitlementLimit("prompt-management-count-prompts");
  const [exportVersions, setExportVersions] = useState<"latest" | "all" | null>(
    null,
  );
  // Incremented on each export click so the effect always fires even when
  // React Query returns the same cached data object reference.
  const exportRequestIdRef = useRef(0);
  const consumedRequestIdRef = useRef(0);

  const exportQuery = api.prompts.exportAll.useQuery(
    {
      projectId,
      includeAllVersions: exportVersions === "all",
    },
    {
      enabled: !!exportVersions && hasReadAccess,
      trpc: { context: { skipBatch: true } },
    },
  );

  React.useEffect(() => {
    if (
      !exportQuery.data ||
      !exportVersions ||
      consumedRequestIdRef.current === exportRequestIdRef.current
    )
      return;
    consumedRequestIdRef.current = exportRequestIdRef.current;
    const json = JSON.stringify(exportQuery.data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `langfuse-prompts-${exportVersions}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportVersions(null);
    capture("prompts:bulk_export", { mode: exportVersions });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportQuery.data, exportRequestIdRef.current]);

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
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportQuery.isFetching}
                  >
                    <UploadIcon className="mr-1 h-4 w-4" />
                    {exportQuery.isFetching ? "Exporting…" : "Export"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      exportRequestIdRef.current += 1;
                      setExportVersions("latest");
                    }}
                  >
                    Latest version per prompt
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      exportRequestIdRef.current += 1;
                      setExportVersions("all");
                    }}
                  >
                    All versions
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {projectId && <ImportPromptsButton projectId={projectId} />}
            <ActionButton
              icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
              hasAccess={hasCUDAccess}
              href={`/project/${projectId}/prompts/new${folderQueryParam ? `?folder=${encodeURIComponent(folderQueryParam)}` : ""}`}
              variant="default"
              limit={promptLimit}
              limitValue={Number(count?.totalCount ?? 0)}
              onClick={() => {
                capture("prompts:new_form_open");
              }}
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
