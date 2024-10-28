import * as React from "react";
import Header from "@/src/components/layouts/header";
import { type RouterOutputs, api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { EvaluatorForm } from "@/src/ee/features/evals/components/evaluator-form";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useState } from "react";
import { Trash } from "lucide-react";
import TableLink from "@/src/components/table/table-link";
import EvalLogTable from "@/src/ee/features/evals/components/eval-log";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import { TableWithMetadataWrapper } from "@/src/components/table/TableWithMetadataWrapper";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";

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
    return <div>Loading...</div>;
  }

  if (evaluator.data && evaluator.data.evalTemplate === null) {
    return <div>Evaluator not found</div>;
  }

  const existingEvaluator =
    evaluator.data && evaluator.data.evalTemplate
      ? { ...evaluator.data, evalTemplate: evaluator.data.evalTemplate }
      : undefined;

  return (
    <FullScreenPage>
      <>
        <Header
          title={`${evaluator.data?.id}` ?? "Loading..."}
          breadcrumb={[
            {
              name: "Evaluators",
              href: `/project/${router.query.projectId as string}/evals`,
            },
            { name: evaluator.data?.id },
          ]}
          actionButtons={
            <>
              <DeactivateEvaluator
                projectId={projectId}
                evaluator={evaluator.data ?? undefined}
                isLoading={evaluator.isLoading}
              />
              {evaluator.data && (
                <DetailPageNav
                  key="nav"
                  currentId={encodeURIComponent(evaluator.data.id)}
                  path={(id) =>
                    `/project/${projectId}/evals/${encodeURIComponent(id)}`
                  }
                  listKey="evals"
                />
              )}
            </>
          }
        />
        {existingEvaluator && (
          <TableWithMetadataWrapper
            tableComponent={
              <EvalLogTable
                projectId={projectId}
                jobConfigurationId={existingEvaluator.id}
              />
            }
            cardTitleChildren={
              <div className="flex w-full flex-row items-center justify-between">
                <span>Evaluation Job</span>
                <StatusBadge
                  type={evaluator.data?.status.toLowerCase()}
                  isLive
                  className="max-h-8"
                />
              </div>
            }
            cardContentChildren={
              <>
                <div className="flex w-full flex-col items-start justify-between space-y-2">
                  <span className="text-sm font-medium">Eval Template</span>
                  <TableLink
                    path={`/project/${projectId}/evals/templates/${existingEvaluator.evalTemplateId}`}
                    value={
                      `${existingEvaluator.evalTemplate.name} (v${existingEvaluator.evalTemplate.version})` ??
                      ""
                    }
                    className="flex min-h-6 items-center"
                  />
                </div>
                <div className="flex w-full flex-col items-start justify-between space-y-2 pb-4">
                  <EvaluatorForm
                    key={existingEvaluator.id}
                    projectId={projectId}
                    evalTemplates={allTemplates.data?.templates}
                    existingEvaluator={existingEvaluator}
                    disabled={true}
                    shouldWrapVariables={true}
                  />
                </div>
              </>
            }
          />
        )}
      </>
    </FullScreenPage>
  );
};

export function DeactivateEvaluator({
  projectId,
  evaluator,
  isLoading,
}: {
  projectId: string;
  evaluator?: RouterOutputs["evals"]["configById"];
  isLoading: boolean;
}) {
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({ projectId, scope: "evalJob:CUD" });
  const [isOpen, setIsOpen] = useState(false);
  const capture = usePostHogClientCapture();

  const mutEvaluator = api.evals.updateEvalJob.useMutation({
    onSuccess: () => {
      void utils.evals.invalidate();
    },
  });

  const onClick = () => {
    if (!projectId) {
      console.error("Project ID is missing");
      return;
    }
    mutEvaluator.mutateAsync({
      projectId,
      evalConfigId: evaluator?.id ?? "",
      updatedStatus: "INACTIVE",
    });
    capture("eval_config:delete");
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={"icon"}
          disabled={!hasAccess || evaluator?.status !== "ACTIVE"}
          loading={isLoading}
        >
          <Trash className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
        <p className="mb-3 text-sm">
          This action permanently deactivates the evaluation job. No more traces
          will be evaluated for this job.
        </p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="destructive"
            loading={mutEvaluator.isLoading}
            onClick={onClick}
          >
            Deactivate Eval Job
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
