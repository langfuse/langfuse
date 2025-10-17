import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { Info, ExternalLink } from "lucide-react";
import { useQueryProject } from "@/src/features/projects/hooks";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";

interface DataTableAIFiltersProps {
  onFiltersGenerated: (filters: FilterState) => void;
}

export function DataTableAIFilters({
  onFiltersGenerated,
}: DataTableAIFiltersProps) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const projectId = useProjectIdFromURL();
  const { organization } = useQueryProject();

  const hasAdminAccess = useHasOrganizationAccess({
    organizationId: organization?.id ?? undefined,
    scope: "organization:update",
  });

  const createFilterMutation =
    api.naturalLanguageFilters.createCompletion.useMutation();

  const handleAiFilterSubmit = async () => {
    if (aiPrompt.trim() && !createFilterMutation.isPending && projectId) {
      setAiError(null);
      try {
        const result = await createFilterMutation.mutateAsync({
          projectId,
          prompt: aiPrompt.trim(),
        });

        if (result && Array.isArray(result.filters)) {
          if (result.filters.length === 0) {
            setAiError("Failed to generate filters, try again");
            return;
          }

          // Set the filters from the API response
          onFiltersGenerated(result.filters as FilterState);
          setAiPrompt("");
        } else {
          console.error(result);
          setAiError("Invalid response format from API");
        }
      } catch (error) {
        console.error("Error calling tRPC API:", error);
        setAiError(
          error instanceof Error ? error.message : "Failed to generate filters",
        );
      }
    }
  };

  // When AI features are not enabled
  if (!organization?.aiFeaturesEnabled) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          AI-powered filters use natural language to generate deterministic
          filters.
          {!hasAdminAccess &&
            " Ask your organization administrator to enable AI features in organization settings."}
        </p>
        {hasAdminAccess && organization?.id && (
          <Button
            onClick={() => {
              window.open(
                `/organization/${organization.id}/settings`,
                "_blank",
              );
            }}
            variant="outline"
            size="sm"
            className="w-fit"
          >
            Enable in Organization Settings
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  // When AI features are enabled
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Filter with AI</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                We convert natural language into deterministic filters which you
                can adjust afterwards
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Textarea
        autoFocus
        value={aiPrompt}
        onChange={(e) => {
          setAiPrompt(e.target.value);
          if (aiError) setAiError(null);
        }}
        placeholder="Describe the filters you want to apply..."
        className="min-h-[80px] resize-none"
        disabled={createFilterMutation.isPending}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.shiftKey &&
            !createFilterMutation.isPending
          ) {
            e.preventDefault();
            handleAiFilterSubmit();
          }
        }}
      />
      <Button
        onClick={handleAiFilterSubmit}
        type="button"
        variant="default"
        size="sm"
        disabled={createFilterMutation.isPending || !aiPrompt.trim()}
        className="w-fit"
      >
        {createFilterMutation.isPending ? "Loading..." : "Generate"}
      </Button>
      {aiError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {aiError}
        </div>
      )}
    </div>
  );
}
