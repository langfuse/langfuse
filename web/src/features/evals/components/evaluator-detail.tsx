import * as React from "react";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import EvalLogTable from "@/src/features/evals/components/eval-log";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import Page from "@/src/components/layouts/page";
import { LevelCountsDisplay } from "@/src/components/level-counts-display";
import { generateJobExecutionCounts } from "@/src/features/evals/utils/job-execution-utils";
import { EvaluatorPausedCallout } from "@/src/features/evals/components/evaluator-paused-callout";
import { type EvaluatorExecutionStatusCount } from "@langfuse/shared";
import { useLazyEvaluatorExecutionCounts } from "@/src/features/evals/hooks/useLazyEvaluatorExecutionCounts";

const JobExecutionCounts = ({
  isLoading,
  jobExecutionCounts,
}: {
  isLoading?: boolean;
  jobExecutionCounts?: EvaluatorExecutionStatusCount[];
}) => {
  if (!isLoading && (!jobExecutionCounts || jobExecutionCounts.length === 0)) {
    return null;
  }

  const counts = generateJobExecutionCounts(jobExecutionCounts);
  return <LevelCountsDisplay counts={counts} isLoading={isLoading} />;
};

export const EvaluatorDetail = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const evaluatorId = router.query.evaluatorId as string;

  // get the current template by id
  const evaluator = api.evals.configById.useQuery({
    projectId: projectId,
    id: evaluatorId,
  });

  const lazyExecutionCounts = useLazyEvaluatorExecutionCounts({
    projectId,
    evaluatorId,
    evaluator: evaluator.data,
  });

  // get all templates for the current template name
  const allTemplates = api.evals.allTemplatesForName.useQuery(
    {
      projectId: projectId,
      name: evaluator.data?.evalTemplate?.name ?? "",
    },
    {
      enabled: !evaluator.isPending && !evaluator.isError,
    },
  );

  if (
    evaluator.isPending ||
    !evaluator.data ||
    allTemplates.isLoading ||
    !allTemplates.data
  ) {
    return <div className="p-3">Loading...</div>;
  }

  if (evaluator.data && evaluator.data.evalTemplate === null) {
    return <div>Evaluator not found</div>;
  }

  const existingEvaluator =
    evaluator.data && evaluator.data.evalTemplate
      ? {
          ...evaluator.data,
          evalTemplate: evaluator.data.evalTemplate,
        }
      : undefined;
  const displayStatus =
    lazyExecutionCounts.displayStatus ?? evaluator.data.displayStatus;
  const shouldRenderExecutionCounts =
    lazyExecutionCounts.isLoading ||
    Boolean(lazyExecutionCounts.jobExecutionCounts?.length);

  return (
    <Page
      headerProps={{
        title: evaluator.data
          ? `${evaluator.data.scoreName}: ${evaluator.data.id}`
          : "Loading...",
        itemType: "EVALUATOR",
        breadcrumb: [
          {
            name: "LLM-as-a-Judge Evaluators",
            href: `/project/${router.query.projectId as string}/evals`,
          },
        ],

        actionButtonsRight: (
          <>
            {shouldRenderExecutionCounts && (
              <div className="bg-muted-gray flex min-h-6 min-w-24 flex-col items-center justify-center rounded-md px-2">
                <JobExecutionCounts
                  isLoading={lazyExecutionCounts.isLoading}
                  jobExecutionCounts={lazyExecutionCounts.jobExecutionCounts}
                />
              </div>
            )}
            <StatusBadge
              type={displayStatus.toLowerCase()}
              isLive
              className="max-h-8"
            />

            {evaluator.data && (
              <DetailPageNav
                key="nav"
                currentId={encodeURIComponent(evaluator.data.id)}
                path={(entry) =>
                  `/project/${projectId}/evals/${encodeURIComponent(entry.id)}`
                }
                listKey="evals"
              />
            )}
          </>
        ),
      }}
    >
      {existingEvaluator && (
        <div className="flex h-full flex-col overflow-hidden">
          {existingEvaluator.blockedAt && (
            <div className="mx-3 mt-3">
              <EvaluatorPausedCallout
                projectId={projectId}
                evalConfig={existingEvaluator}
              />
            </div>
          )}
          <EvalLogTable
            projectId={projectId}
            jobConfigurationId={existingEvaluator.id}
          />
        </div>
      )}
    </Page>
  );
};
