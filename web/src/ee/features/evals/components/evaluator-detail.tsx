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
import TableLink from "@/src/components/table/table-link";
import EvalLogTable from "@/src/ee/features/evals/components/eval-log";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import { TableWithMetadataWrapper } from "@/src/components/table/TableWithMetadataWrapper";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { CardDescription } from "@/src/components/ui/card";
import { EvaluatorStatus } from "@/src/ee/features/evals/types";
import { Switch } from "@/src/components/ui/switch";
import { Edit } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";

export const EvaluatorDetail = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const evaluatorId = router.query.evaluatorId as string;

  const [isEditOpen, setIsEditOpen] = useState(false);

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
      <Header
        title={evaluator.data ? `Evaluator ${evaluator.data.id}` : "Loading..."}
        breadcrumb={[
          {
            name: "Evaluators",
            href: `/project/${router.query.projectId as string}/evals`,
          },
          { name: evaluator.data?.id },
        ]}
        actionButtons={
          <>
            <StatusBadge
              type={evaluator.data?.status.toLowerCase()}
              isLive
              className="max-h-8"
            />
            <DeactivateEvaluator
              projectId={projectId}
              evaluator={evaluator.data ?? undefined}
              isLoading={evaluator.isLoading}
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
              <span>Evaluator configuration</span>
              <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-2">
                    <Edit className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-screen-xl">
                  <DialogTitle>Edit Evaluator</DialogTitle>
                  <div className="max-h-[80vh] overflow-y-auto">
                    <EvaluatorForm
                      key={existingEvaluator.id}
                      projectId={projectId}
                      evalTemplates={allTemplates.data?.templates}
                      existingEvaluator={existingEvaluator}
                      shouldWrapVariables={true}
                      mode="edit"
                      onFormSuccess={() => {
                        setIsEditOpen(false);
                        // Force a reload as the form state is not properly updated
                        void router.reload();
                      }}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          }
          cardContentChildren={
            <>
              <CardDescription className="flex items-center justify-between text-sm">
                <span className="text-sm font-medium">Eval Template</span>
                <TableLink
                  path={`/project/${projectId}/evals/templates/${existingEvaluator.evalTemplateId}`}
                  value={`${existingEvaluator.evalTemplate.name} (v${existingEvaluator.evalTemplate.version})`}
                  className="flex min-h-6 items-center"
                />
              </CardDescription>
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
    </FullScreenPage>
  );
};

export function DeactivateEvaluator({
  projectId,
  evaluator,
}: {
  projectId: string;
  evaluator?: RouterOutputs["evals"]["configById"];
  isLoading: boolean;
}) {
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({ projectId, scope: "evalJob:CUD" });
  const [isOpen, setIsOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const isActive = evaluator?.status === EvaluatorStatus.ACTIVE;

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

    const prevStatus = evaluator?.status;

    mutEvaluator.mutateAsync({
      projectId,
      evalConfigId: evaluator?.id ?? "",
      config: {
        status: isActive ? EvaluatorStatus.INACTIVE : EvaluatorStatus.ACTIVE,
      },
    });
    capture(
      prevStatus === EvaluatorStatus.ACTIVE
        ? "eval_config:deactivate"
        : "eval_config:activate",
    );
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
      <PopoverTrigger asChild>
        <div className="flex items-center">
          <Switch
            disabled={!hasAccess}
            checked={isActive}
            className={isActive ? "data-[state=checked]:bg-dark-green" : ""}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
        <p className="mb-3 text-sm">
          {evaluator?.status === "ACTIVE"
            ? "This action will deactivate the evaluator. No more traces will be evaluated based on this evaluator."
            : "This action will activate the evaluator. New traces will be evaluated based on this evaluator."}
        </p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant={evaluator?.status === "ACTIVE" ? "destructive" : "default"}
            loading={mutEvaluator.isLoading}
            onClick={onClick}
          >
            {evaluator?.status === "ACTIVE" ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
