import { usePeekState } from "@/src/components/table/peek/hooks/usePeekState";
import { type EvaluatorDataRow } from "@/src/features/evals/components/evaluator-table";
import { Skeleton } from "@/src/components/ui/skeleton";
import TableLink from "@/src/components/table/table-link";
import { CardDescription } from "@/src/components/ui/card";
import { EvaluatorForm } from "@/src/features/evals/components/evaluator-form";
import { usePeekEvalConfigData } from "@/src/components/table/peek/hooks/usePeekEvalConfigData";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { UserCircle2Icon } from "lucide-react";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { DeactivateEvalConfig } from "@/src/features/evals/components/deactivate-config";

export const PeekViewEvaluatorConfigDetail = ({
  projectId,
  row,
}: {
  projectId: string;
  row?: EvaluatorDataRow;
}) => {
  const { peekId } = usePeekState();

  const { data: evalConfig } = usePeekEvalConfigData({
    jobConfigurationId: peekId,
    projectId,
  });

  if (!evalConfig) {
    return <Skeleton className="h-full w-full" />;
  }

  return (
    <div className="grid h-full flex-1 grid-rows-[auto,auto,1fr] gap-2 overflow-hidden p-3 contain-layout">
      <div className="flex items-center justify-between">
        <span className="max-h-fit text-lg font-medium">Configuration</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <StatusBadge
              type={evalConfig.status.toLowerCase()}
              isLive
              className="max-h-8"
            />
            <DeactivateEvalConfig
              projectId={projectId}
              evalConfig={evalConfig}
            />
          </div>
          <span className="text-sm text-muted-foreground">View Only</span>
        </div>
      </div>
      <CardDescription className="flex items-center text-sm">
        <span className="mr-2 text-sm font-medium">Referenced Evaluator</span>
        {row?.template && (
          <TableLink
            path={`/project/${projectId}/evals/templates/${row?.template.id}`}
            value={row?.template.name}
            className="mr-1 flex min-h-6 items-center"
          />
        )}
        {row?.maintainer && (
          <Tooltip>
            <TooltipTrigger>
              {row.maintainer.includes("Langfuse") ? (
                <LangfuseIcon size={16} />
              ) : (
                <UserCircle2Icon className="h-4 w-4" />
              )}
            </TooltipTrigger>
            <TooltipContent>{row.maintainer}</TooltipContent>
          </Tooltip>
        )}
      </CardDescription>
      <div className="flex max-h-full w-full flex-col items-start justify-between space-y-2 overflow-y-auto pb-4">
        <EvaluatorForm
          key={evalConfig?.id}
          projectId={projectId}
          evalTemplates={
            evalConfig?.evalTemplate ? [evalConfig.evalTemplate] : []
          }
          existingEvaluator={
            evalConfig.evalTemplate
              ? {
                  ...evalConfig,
                  evalTemplate: evalConfig.evalTemplate,
                }
              : undefined
          }
          disabled={true}
          shouldWrapVariables={true}
          useDialog={false}
        />
      </div>
    </div>
  );
};
