import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";

type ExperimentOverviewPanelProps = {
  projectId: string;
  experiment: {
    id: string;
    name: string;
    description: string | null;
    datasetId: string;
    datasetName?: string;
    prompts: Array<[string, number | null]>; // [prompt_name, prompt_version]
    metadata: Record<string, string>;
    startTime: Date;
  };
};

export function ExperimentOverviewPanel({
  projectId,
  experiment,
}: ExperimentOverviewPanelProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const provider = experiment.metadata?.provider;
  const model = experiment.metadata?.model;

  // Get the first prompt name and version from the prompts array
  const [promptName, promptVersion] =
    experiment.prompts.length > 0 ? experiment.prompts[0] : [null, null];

  // Check if description is long (more than 150 chars)
  const isLongDescription =
    experiment.description && experiment.description.length > 150;
  const shouldTruncate = isLongDescription && !isDescriptionExpanded;
  const displayDescription = shouldTruncate
    ? experiment.description?.slice(0, 150) + "..."
    : experiment.description;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Experiment Details</h3>

      <div className="space-y-3 text-sm">
        {/* Name */}
        <div>
          <div className="text-xs text-muted-foreground">Name</div>
          <div className="font-medium">{experiment.name}</div>
        </div>

        {/* Description */}
        {experiment.description && (
          <div>
            <div className="text-xs text-muted-foreground">Description</div>
            <div className="break-words">{displayDescription}</div>
            {isLongDescription && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
              >
                {isDescriptionExpanded ? "Show less" : "Show more"}
              </Button>
            )}
          </div>
        )}

        {/* Dataset */}
        <div>
          <div className="text-xs text-muted-foreground">Dataset</div>
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
            <div className="text-xs text-muted-foreground">Prompt</div>
            <Link
              href={`/project/${projectId}/prompts/${encodeURIComponent(promptName)}${promptVersion !== null ? `?version=${promptVersion}` : ""}`}
              className="text-primary hover:underline"
            >
              {promptName}
              {promptVersion !== null && (
                <span className="ml-1 text-muted-foreground">
                  (v{promptVersion})
                </span>
              )}
            </Link>
          </div>
        )}

        {/* Model Configuration */}
        {(provider || model) && (
          <div>
            <div className="text-xs text-muted-foreground">Model</div>
            <div>
              {provider && model ? `${provider}/${model}` : provider || model}
            </div>
          </div>
        )}

        {/* Start Time */}
        <div>
          <div className="text-xs text-muted-foreground">Start Time</div>
          <LocalIsoDate date={experiment.startTime} />
        </div>
      </div>
    </div>
  );
}
