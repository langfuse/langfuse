import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { ExperimentMetadataSection } from "./ExperimentMetadataSection";
import {
  ExperimentOverviewField,
  ExperimentOverviewSectionHeading,
} from "./ExperimentOverviewField";
import { useTranslations } from "next-intl";

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
};

export function ExperimentOverviewPanel({
  projectId,
  experiment,
}: ExperimentOverviewPanelProps) {
  const t = useTranslations("evaluationAnalytics.experiments");
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const metadata = experiment?.metadata ?? {};
  const provider = metadata.provider;
  const model = metadata.model;
  const pullRequestUrl = metadata["langfuse.pr_url"];
  const githubJobUrl = metadata["langfuse.github_job_url"];
  const safePullRequestUrl = isSafeHttpUrl(pullRequestUrl)
    ? pullRequestUrl
    : undefined;
  const safeGithubJobUrl = isSafeHttpUrl(githubJobUrl)
    ? githubJobUrl
    : undefined;
  const additionalMetadata = { ...metadata };
  if (provider || model) {
    delete additionalMetadata.provider;
    delete additionalMetadata.model;
  }
  if (safePullRequestUrl) delete additionalMetadata["langfuse.pr_url"];
  if (safeGithubJobUrl) delete additionalMetadata["langfuse.github_job_url"];

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
      <h3 className="text-lg font-bold">{t("overview.baselineDetails")}</h3>

      {experiment ? (
        <>
          <div>
            <ExperimentOverviewSectionHeading>
              {t("overview.title")}
            </ExperimentOverviewSectionHeading>
            <div className="space-y-3 text-sm">
              <ExperimentOverviewField label={t("overview.name")}>
                <div className="font-bold">{experiment.name}</div>
              </ExperimentOverviewField>

              {experiment.description && (
                <ExperimentOverviewField label={t("overview.description")}>
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
                      {isDescriptionExpanded
                        ? t("overview.showLess")
                        : t("overview.showMore")}
                    </Button>
                  )}
                </ExperimentOverviewField>
              )}

              <ExperimentOverviewField label={t("overview.dataset")}>
                <Link
                  href={`/project/${projectId}/datasets/${encodeURIComponent(experiment.datasetId)}`}
                  className="text-primary hover:underline"
                >
                  {experiment.datasetName || experiment.datasetId}
                </Link>
              </ExperimentOverviewField>

              {promptName && (
                <ExperimentOverviewField label={t("overview.prompt")}>
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
                </ExperimentOverviewField>
              )}

              {(provider || model) && (
                <ExperimentOverviewField label={t("overview.model")}>
                  <div>
                    {provider && model
                      ? `${provider}/${model}`
                      : provider || model}
                  </div>
                </ExperimentOverviewField>
              )}

              <ExperimentOverviewField label={t("overview.startTime")}>
                <LocalIsoDate date={experiment.startTime} />
              </ExperimentOverviewField>

              {safePullRequestUrl && (
                <ExperimentOverviewField label={t("overview.pullRequestUrl")}>
                  <a
                    href={safePullRequestUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary break-all hover:underline"
                  >
                    {safePullRequestUrl}
                  </a>
                </ExperimentOverviewField>
              )}

              {safeGithubJobUrl && (
                <ExperimentOverviewField label={t("overview.githubJobUrl")}>
                  <a
                    href={safeGithubJobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary break-all hover:underline"
                  >
                    {safeGithubJobUrl}
                  </a>
                </ExperimentOverviewField>
              )}
            </div>
          </div>

          <ExperimentMetadataSection metadata={additionalMetadata} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("overview.selectBaselineForDetails")}
        </p>
      )}
    </div>
  );
}
