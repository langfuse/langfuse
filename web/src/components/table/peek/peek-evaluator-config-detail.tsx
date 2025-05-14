import { usePeekState } from "@/src/components/table/peek/hooks/usePeekState";
import { type EvaluatorDataRow } from "@/src/ee/features/evals/components/evaluator-table";
import { Skeleton } from "@/src/components/ui/skeleton";
import TableLink from "@/src/components/table/table-link";
import { CardDescription } from "@/src/components/ui/card";
import { EvaluatorForm } from "@/src/ee/features/evals/components/evaluator-form";
import { usePeekEvalConfigData } from "@/src/components/table/peek/hooks/usePeekEvalConfigData";
import { Switch } from "@/src/components/ui/switch";

export const PeekViewEvaluatorConfigDetail = ({
  projectId,
  row,
}: {
  projectId: string;
  row?: EvaluatorDataRow;
}) => {
  const { peekId } = usePeekState("evals");

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
          <span
            className="text-sm text-muted-foreground"
            title="Expand to full page to edit"
          >
            View Only
          </span>
        </div>
      </div>
      <CardDescription className="flex items-center text-sm">
        <span className="mr-2 text-sm font-medium">Referenced Evaluator</span>
        {row?.template && (
          <TableLink
            path={`/project/${projectId}/evals/templates/${row?.template.id}`}
            value={row?.template.name}
            className="flex min-h-6 items-center"
          />
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
        />
      </div>
    </div>
  );
};
