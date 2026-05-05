import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { ExperimentComparisonSelector } from "./ExperimentComparisonSelector";
import { ExperimentBaselineControls } from "./ExperimentBaselineControls";
import Link from "next/link";
import { ExperimentMetadataSection } from "./ExperimentMetadataSection";

const isSafeHttpUrl = (value: string | undefined) => {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

type ExperimentOverviewPanelProps = {
  projectId: string;
  hasBaseline: boolean;
  experiment?: {
    id: string;
    name: string;
    description: string | null;
    datasetId: string;
    datasetName?: string;
    prompts: Array<[string, number | null]>; // [prompt_name, prompt_version]
    metadata: Record<string, string>;
    startTime: Date;
  };
  // Comparison selector props
  comparisonIds: string[];
  onComparisonIdsChange: (ids: string[]) => void;
  // Baseline controls props
  onBaselineChange: (id: string) => void;
  onBaselineClear: () => void;
};

export function ExperimentOverviewPanel({
  projectId,
  hasBaseline,
  experiment,
  comparisonIds,
  onComparisonIdsChange,
  onBaselineChange,
  onBaselineClear,
}: ExperimentOverviewPanelProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const {
    provider,
    model,
    "langfuse.pr_url": pullRequestUrl,
    "langfuse.github_job_url": githubJobUrl,
    ...additionalMetadata
  } = experiment?.metadata ?? {};
  const safePullRequestUrl = isSafeHttpUrl(pullRequestUrl)
    ? pullRequestUrl
    : undefined;
  const safeGithubJobUrl = isSafeHttpUrl(githubJobUrl)
    ? githubJobUrl
    : undefined;

  // Get the first prompt name and version from the prompts array
  const [promptName, promptVersion] =
    experiment && experiment.prompts.length > 0
      ? experiment.prompts[0]
      : [null, null];

  // Check if description is long (more than 150 chars)
  const isLongDescription =
    experiment?.description && experiment.description.length > 150;
  const shouldTruncate = isLongDescription && !isDescriptionExpanded;
  const displayDescription = shouldTruncate
    ? experiment?.description?.slice(0, 150) + "..."
    : experiment?.description;

  return (
    <div className="space-y-4">
      <div className="bg-background sticky -top-4 z-30 -mx-4 -mt-4 space-y-4 px-4 pt-2 pb-2">
        <h3 className="text-lg font-semibold">Experiment Details</h3>

        <div>
          <h4 className="mb-2 text-sm font-medium">Baseline</h4>
          <ExperimentBaselineControls
            projectId={projectId}
            baselineId={experiment?.id}
            baselineName={experiment?.name}
            onBaselineChange={onBaselineChange}
            onBaselineClear={onBaselineClear}
            canClearBaseline={comparisonIds.length > 0}
          />
        </div>

        <div className="border-t pt-4">
          <h4 className="mb-2 text-sm font-medium">Compare with</h4>
          <ExperimentComparisonSelector
            projectId={projectId}
            baselineExperimentId={experiment?.id}
            selectedIds={comparisonIds}
            onSelectedIdsChange={onComparisonIdsChange}
          />
        </div>
      </div>

      {hasBaseline && experiment ? (
        <>
          <div className="border-t pt-4">
            <h4 className="mb-2 text-sm font-medium">Overview</h4>
            <div className="space-y-3 text-sm">
              {/* Name */}
              <div>
                <div className="text-muted-foreground text-xs">Name</div>
                <div className="font-medium">{experiment.name}</div>
              </div>

              {/* Description */}
              {experiment.description && (
                <div>
                  <div className="text-muted-foreground text-xs">
                    Description
                  </div>
                  <div className="break-words">{displayDescription}</div>
                  {isLongDescription && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() =>
                        setIsDescriptionExpanded(!isDescriptionExpanded)
                      }
                    >
                      {isDescriptionExpanded ? "Show less" : "Show more"}
                    </Button>
                  )}
                </div>
              )}

              {/* Dataset */}
              <div>
                <div className="text-muted-foreground text-xs">Dataset</div>
                <Link
                  href={`/project/${projectId}/datasets/${encodeURIComponent(experiment.datasetId)}`}
                  className="text-primary hover:underline"
                >
                  {experiment.datasetName || experiment.datasetId}
                </Link>
              </div>

              {/* Prompt */}
              {promptName && (
                <div>
                  <div className="text-muted-foreground text-xs">Prompt</div>
                  <Link
                    href={`/project/${projectId}/prompts/${encodeURIComponent(promptName)}${promptVersion !== null ? `?version=${promptVersion}` : ""}`}
                    className="text-primary hover:underline"
                  >
                    {promptName}
                    {promptVersion !== null && (
                      <span className="text-muted-foreground ml-1">
                        (v{promptVersion})
                      </span>
                    )}
                  </Link>
                </div>
              )}

              {/* Model Configuration */}
              {(provider || model) && (
                <div>
                  <div className="text-muted-foreground text-xs">Model</div>
                  <div>
                    {provider && model
                      ? `${provider}/${model}`
                      : provider || model}
                  </div>
                </div>
              )}

              {/* Start Time */}
              <div>
                <div className="text-muted-foreground text-xs">Start Time</div>
                <LocalIsoDate date={experiment.startTime} />
              </div>
              {safePullRequestUrl && (
                <div>
                  <div className="text-muted-foreground text-xs">
                    Pull Request URL
                  </div>
                  <a
                    href={safePullRequestUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary break-all hover:underline"
                  >
                    {safePullRequestUrl}
                  </a>
                </div>
              )}

              {safeGithubJobUrl && (
                <div>
                  <div className="text-muted-foreground text-xs">
                    GitHub Job URL
                  </div>
                  <a
                    href={safeGithubJobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary break-all hover:underline"
                  >
                    {safeGithubJobUrl}
                  </a>
                </div>
              )}
            </div>
          </div>

          <ExperimentMetadataSection metadata={additionalMetadata} />
        </>
      ) : null}
    </div>
  );
}
