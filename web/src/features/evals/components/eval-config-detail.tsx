import * as React from "react";
import Header from "@/src/components/layouts/header";
import { type RouterOutputs, api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { EvalConfigForm } from "@/src/features/evals/components/eval-config-form";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useState } from "react";
import { Trash2 } from "lucide-react";

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

  return (
    <div className="md:container">
      <Header
        title={config.data?.id ?? "Loading..."}
        status={config.data?.status.toLowerCase()}
        actionButtons={
          <DeactivateConfig
            projectId={projectId}
            config={config.data ?? undefined}
            isLoading={config.isLoading}
          />
        }
      />
      <EvalConfigForm
        projectId={projectId}
        evalTemplates={allTemplates.data?.templates}
        existingEvalConfig={
          config.data && config.data.evalTemplate
            ? { ...config.data, evalTemplate: config.data.evalTemplate }
            : undefined
        }
        disabled={true}
      />
    </div>
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
  const hasAccess = useHasAccess({ projectId, scope: "job:CUD" });
  const [isOpen, setIsOpen] = useState(false);

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
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={"sm"}
          disabled={!hasAccess || config?.status !== "ACTIVE"}
          loading={isLoading}
        >
          <Trash2 className="h-5 w-5" />
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
