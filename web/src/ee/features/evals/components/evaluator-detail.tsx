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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { Label } from "@/src/components/ui/label";
import TableLink from "@/src/components/table/table-link";
import EvalLogTable from "@/src/ee/features/evals/components/eval-log";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";

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
    <div className="md:container">
      <Header
        title={evaluator.data?.id ?? "Loading..."}
        status={evaluator.data?.status.toLowerCase()}
        actionButtons={
          <DeactivateEvaluator
            projectId={projectId}
            evaluator={evaluator.data ?? undefined}
            isLoading={evaluator.isLoading}
          />
        }
        breadcrumb={[
          {
            name: "Evaluators",
            href: `/project/${router.query.projectId as string}/evals`,
          },
          { name: evaluator.data?.id },
        ]}
      />
      {existingEvaluator && (
        <>
          <div className="my-5 flex items-center gap-4 rounded-md border p-2">
            <Label>Eval Template</Label>
            <TableLink
              path={`/project/${projectId}/evals/templates/${existingEvaluator.evalTemplateId}`}
              value={
                `${existingEvaluator.evalTemplate.name} (v${existingEvaluator.evalTemplate.version})` ??
                ""
              }
            />
          </div>

          <Tabs defaultValue="logs">
            <TabsList>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
            </TabsList>
            <TabsContent value="configuration">
              <EvaluatorForm
                projectId={projectId}
                evalTemplates={allTemplates.data?.templates}
                existingEvaluator={existingEvaluator}
                disabled={true}
              />
            </TabsContent>
            <TabsContent value="logs">
              <FullScreenPage
                lgHeight="lg:h-[calc(100dvh-13rem)]"
                mobileHeight="h-[calc(100dvh-17rem)]"
              >
                <EvalLogTable
                  projectId={projectId}
                  jobConfigurationId={existingEvaluator.id}
                />
              </FullScreenPage>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
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
          variant="ghost"
          size={"sm"}
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
