import { usePeekState } from "@/src/components/table/peek/hooks/usePeekState";
import { Skeleton } from "@/src/components/ui/skeleton";
import { usePeekEvalTemplateData } from "@/src/components/table/peek/hooks/usePeekEvalTemplateData";
import { EvalTemplateForm } from "@/src/ee/features/evals/components/template-form";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { UserCircle2Icon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

export const PeekViewEvaluatorTemplateDetail = ({
  projectId,
}: {
  projectId: string;
}) => {
  const { peekId } = usePeekState("eval-templates");

  const { data: template } = usePeekEvalTemplateData({
    templateId: peekId,
    projectId,
  });

  if (!template) {
    return <Skeleton className="h-full w-full" />;
  }

  const isLangfuseMaintained = template.projectId === null;

  return (
    <div className="grid h-full flex-1 grid-rows-[auto,1fr] gap-2 overflow-hidden p-4 contain-layout">
      <div className="flex w-full flex-col items-start justify-between space-y-2 overflow-y-auto pb-4">
        <div className="mb-1 w-full rounded-md border border-border bg-muted/50 p-4">
          <h3 className="mb-1 text-sm font-medium">Selected Evaluator</h3>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">{template.name}</p>
            <Tooltip>
              <TooltipTrigger>
                {isLangfuseMaintained ? (
                  <LangfuseIcon size={16} />
                ) : (
                  <UserCircle2Icon className="h-4 w-4" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                {isLangfuseMaintained
                  ? "Langfuse maintained"
                  : "User maintained"}
              </TooltipContent>
            </Tooltip>
          </div>
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
