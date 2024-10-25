import * as React from "react";
import Header from "@/src/components/layouts/header";
import { type RouterOutputs, api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { EvalConfigForm } from "@/src/ee/features/evals/components/eval-config-form";
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

export const EvalConfigDetail = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const configId = router.query.configId as string;

  // get the current template by id
  const config = api.evals.configById.useQuery({
    projectId: projectId,
    id: configId,
  });

  // get all templates for the current template name
  const allTemplates = api.evals.allTemplatesForName.useQuery(
    {
      projectId: projectId,
      name: config.data?.evalTemplate?.name ?? "",
    },
    {
      enabled: !config.isLoading && !config.isError,
    },
  );

  if (
    config.isLoading ||
    !config.data ||
    allTemplates.isLoading ||
    !allTemplates.data
  ) {
    return <div>Loading...</div>;
  }

  if (config.data && config.data.evalTemplate === null) {
    return <div>Config not found</div>;
  }

  const existingEvalConfig =
    config.data && config.data.evalTemplate
      ? { ...config.data, evalTemplate: config.data.evalTemplate }
      : undefined;

  return (
    <FullScreenPage>
      <>
        <Header
          title={`${config.data?.id}` ?? "Loading..."}
          actionButtons={
            <DeactivateConfig
              projectId={projectId}
              config={config.data ?? undefined}
              isLoading={config.isLoading}
            />
          }
          breadcrumb={[
            {
              name: "Evaluation Jobs",
              href: `/project/${router.query.projectId as string}/evals/configs`,
            },
            { name: config.data?.id },
          ]}
        />
        {existingEvalConfig && (
          <TableWithMetadataWrapper
            tableComponent={
              <EvalLogTable
                projectId={projectId}
                jobConfigurationId={existingEvalConfig.id}
              />
            }
            cardTitleChildren={
              <div className="flex w-full flex-row items-center justify-between">
                <span>Evaluation Job</span>
                <StatusBadge
                  type={config.data?.status.toLowerCase()}
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
                    path={`/project/${projectId}/evals/templates/${existingEvalConfig.evalTemplateId}`}
                    value={
                      `${existingEvalConfig.evalTemplate.name} (v${existingEvalConfig.evalTemplate.version})` ??
                      ""
                    }
                    className="flex min-h-6 items-center"
                  />
                </div>
                <div className="flex w-full flex-col items-start justify-between space-y-2 pb-4">
                  <EvalConfigForm
                    projectId={projectId}
                    evalTemplates={allTemplates.data?.templates}
                    existingEvalConfig={existingEvalConfig}
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

export function DeactivateConfig({
  projectId,
  config,
  isLoading,
}: {
  projectId: string;
  config?: RouterOutputs["evals"]["configById"];
  isLoading: boolean;
}) {
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({ projectId, scope: "evalJob:CUD" });
  const [isOpen, setIsOpen] = useState(false);
  const capture = usePostHogClientCapture();

  const mutEvalConfig = api.evals.updateEvalJob.useMutation({
    onSuccess: () => {
      void utils.evals.invalidate();
    },
  });

  const onClick = () => {
    if (!projectId) {
      console.error("Project ID is missing");
      return;
    }
    mutEvalConfig.mutateAsync({
      projectId,
      evalConfigId: config?.id ?? "",
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
          disabled={!hasAccess || config?.status !== "ACTIVE"}
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
            loading={mutEvalConfig.isLoading}
            onClick={onClick}
          >
            Deactivate Eval Job
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
