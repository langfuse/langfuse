import { usePeekState } from "@/src/components/table/peek/hooks/usePeekState";
import { type EvaluatorDataRow } from "@/src/ee/features/evals/components/evaluator-table";
import { Skeleton } from "@/src/components/ui/skeleton";
import EvalLogTable from "@/src/ee/features/evals/components/eval-log";
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
} from "@/src/components/ui/side-panel";
import TableLink from "@/src/components/table/table-link";
import { CardDescription } from "@/src/components/ui/card";
import { EvaluatorForm } from "@/src/ee/features/evals/components/evaluator-form";
import { usePeekEvalConfigData } from "@/src/components/table/peek/hooks/usePeekEvalConfigData";
import { useIsMobile } from "@/src/hooks/use-mobile";

export const PeekViewEvaluatorConfigDetail = ({
  projectId,
  row,
}: {
  projectId: string;
  row?: EvaluatorDataRow;
}) => {
  const { peekId } = usePeekState("evals");
  const isMobile = useIsMobile();

  const { data: evalConfig } = usePeekEvalConfigData({
    jobConfigurationId: peekId,
    projectId,
  });

  if (!evalConfig) {
    return <Skeleton className="h-full w-full" />;
  }

  if (isMobile) {
    return (
      <div className="grid h-full flex-1 grid-rows-[auto,auto,1fr] gap-2 overflow-hidden p-1 contain-layout">
        <span className="max-h-fit text-lg font-medium">
          Running Evaluator Configuration
        </span>
        <CardDescription className="flex items-center justify-between text-sm">
          <span className="mr-2 text-sm font-medium">Referenced Evaluator</span>
          {row?.template && (
            <TableLink
              path={`/project/${projectId}/evals/templates/${row?.template.id}`}
              value={row?.template.name}
              className="flex min-h-6 items-center"
            />
          )}
        </CardDescription>
        <div className="flex max-h-[80dvh] w-full flex-col items-start justify-between space-y-2 overflow-y-auto pb-4">
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
  }

  return (
    <div className="grid h-full flex-1 grid-cols-[1fr,auto] overflow-hidden contain-layout">
      <div className="flex h-full flex-col overflow-hidden">
        <EvalLogTable projectId={projectId} jobConfigurationId={peekId} />
      </div>
      <SidePanel
        mobileTitle="Running Evaluator Configuration"
        id="evaluator-configuration"
      >
        <SidePanelHeader>
          <SidePanelTitle>Running Evaluator Configuration</SidePanelTitle>
        </SidePanelHeader>
        <SidePanelContent>
          <>
            <CardDescription className="flex items-center justify-between text-sm">
              <span className="mr-2 text-sm font-medium">
                Referenced Evaluator
              </span>
              {row?.template && (
                <TableLink
                  path={`/project/${projectId}/evals/templates/${row?.template.id}`}
                  value={row?.template.name}
                  className="flex min-h-6 items-center"
                />
              )}
            </CardDescription>
            <div className="flex w-full flex-col items-start justify-between space-y-2 overflow-y-auto pb-4">
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
          </>
        </SidePanelContent>
      </SidePanel>
    </div>
  );
};
