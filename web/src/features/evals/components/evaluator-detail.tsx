import * as React from "react";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import EvalLogTable from "@/src/features/evals/components/eval-log";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import Page from "@/src/components/layouts/page";
import { LevelCountsDisplay } from "@/src/components/level-counts-display";
import {
  type JobExecutionState,
  generateJobExecutionCounts,
} from "@/src/features/evals/utils/job-execution-utils";

const JobExecutionCounts = ({
  jobExecutionsByState,
}: {
  jobExecutionsByState?: JobExecutionState[];
}) => {
  if (!jobExecutionsByState || jobExecutionsByState.length === 0) {
    return null;
  }

  const counts = generateJobExecutionCounts(jobExecutionsByState);
  return <LevelCountsDisplay counts={counts} />;
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

  // get all templates for the current template name
  const allTemplates = api.evals.allTemplatesForName.useQuery(
    {
      projectId: projectId,
      name: evaluator.data?.evalTemplate?.name ?? "",
    },
    {
      enabled: !evaluator.isLoading && !evaluator.isError,
    },
  );

  if (
    evaluator.isLoading ||
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
            {evaluator.data?.jobExecutionsByState && (
              <div className="flex flex-col items-center justify-center rounded-md bg-muted-gray px-2">
                <JobExecutionCounts
                  jobExecutionsByState={evaluator.data.jobExecutionsByState}
                />
              </div>
            )}
            <StatusBadge
              type={evaluator.data?.finalStatus.toLowerCase()}
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
        <div className="grid flex-1 grid-cols-[1fr,auto] overflow-hidden contain-layout">
          <div className="flex h-full flex-col overflow-hidden">
            <EvalLogTable
              projectId={projectId}
              jobConfigurationId={existingEvaluator.id}
            />
          </div>
        </div>
      )}
    </Page>
  );
};
