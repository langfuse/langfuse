import { usePeekState } from "@/src/components/table/peek/hooks/usePeekState";
import { type EvalsTemplateRow } from "@/src/ee/features/evals/components/eval-templates-table";
import { Skeleton } from "@/src/components/ui/skeleton";
import { usePeekEvalTemplateData } from "@/src/components/table/peek/hooks/usePeekEvalTemplateData";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { EvalTemplateForm } from "@/src/ee/features/evals/components/template-form";

export const PeekViewEvaluatorTemplateDetail = ({
  projectId,
  row,
}: {
  projectId: string;
  row?: EvalsTemplateRow;
}) => {
  const { peekId } = usePeekState("eval-templates");
  const isMobile = useIsMobile();

  const { data: template } = usePeekEvalTemplateData({
    templateId: peekId,
    projectId,
  });

  if (!template) {
    return <Skeleton className="h-full w-full" />;
  }

  if (isMobile) {
    return (
      <div className="grid h-full flex-1 grid-rows-[auto,1fr] gap-2 overflow-hidden p-1 contain-layout">
        <span className="max-h-fit text-lg font-medium">
          Evaluator Template
        </span>
        <div className="flex max-h-[80dvh] w-full flex-col items-start justify-between space-y-2 overflow-y-auto pb-4">
          <EvalTemplateForm
            key={template.id}
            projectId={projectId}
            existingEvalTemplate={template}
            isEditing={false}
            preventRedirect={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full flex-1 grid-rows-[auto,1fr] gap-2 overflow-hidden p-4 contain-layout">
      <div className="flex w-full flex-col items-start justify-between space-y-2 overflow-y-auto pb-4">
        <div className="mb-4 w-full rounded-md border border-border bg-muted/50 p-4">
          <h3 className="mb-1 text-sm font-medium">Selected Evaluator</h3>
          <p className="text-sm text-muted-foreground">{template.name}</p>
        </div>
        <EvalTemplateForm
          key={template.id}
          projectId={projectId}
          existingEvalTemplate={template}
          isEditing={false}
          preventRedirect={true}
        />
      </div>
    </div>
  );
};
