import { useRouter } from "next/router";
import Link from "next/link";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Callout } from "@/src/components/ui/callout";
import { Badge } from "@/src/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { usePeekEvalTemplateData } from "@/src/components/table/peek/hooks/usePeekEvalTemplateData";
import { EvalTemplateForm } from "@/src/features/evals/components/template-form";
import { MaintainerTooltip } from "@/src/features/evals/components/maintainer-tooltip";
import { getMaintainer } from "@/src/features/evals/utils/typeHelpers";

export const PeekViewEvaluatorTemplateDetail = ({
  projectId,
}: {
  projectId: string;
}) => {
  const router = useRouter();
  const peekId = router.query.peek as string | undefined;

  const { data: template } = usePeekEvalTemplateData({
    templateId: peekId,
    projectId,
  });

  if (!template) {
    return <Skeleton className="h-full w-full rounded-none" />;
  }

  const statusReason = template.statusReason as
    | { code: string; description: string }
    | null
    | undefined;

  return (
    <div className="grid h-full flex-1 grid-rows-[auto,1fr] gap-2 overflow-hidden p-4 contain-layout">
      <div className="flex w-full flex-col items-start justify-between space-y-2 overflow-y-auto pb-4">
        <div className="mb-1 w-full rounded-md border border-border bg-muted/50 p-4">
          <h3 className="mb-1 text-sm font-medium">Selected Evaluator</h3>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">{template.name}</p>
            <MaintainerTooltip maintainer={getMaintainer(template)} />
            {template.effectiveStatus === "ERROR" && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="warning" className="w-fit text-xs">
                    Paused
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{statusReason?.description}</p>
                  <Link
                    href={`/project/${projectId}/evals/templates/${template.id}`}
                    className="text-primary hover:underline"
                  >
                    Fix in evaluator template
                  </Link>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        {template.effectiveStatus === "ERROR" && (
          <div className="mb-3 w-full">
            <Callout id="eval-template-peek-error" variant="warning">
              <p className="font-medium">Evaluator paused</p>
              <p className="mb-2 mt-1">{statusReason?.description}</p>
              <p className="text-sm text-muted-foreground">
                {statusReason?.code === "LLM_401"
                  ? "Fix your LLM connection in Project Settings, then edit and save this template."
                  : "Use the Edit button to select a valid model, or update the default evaluation model in Project Settings."}
              </p>
              {statusReason?.code === "LLM_401" && (
                <Link
                  href={`/project/${projectId}/settings/llm-connections`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Go to LLM Connections
                </Link>
              )}
            </Callout>
          </div>
        )}
        <EvalTemplateForm
          key={template.id}
          projectId={projectId}
          existingEvalTemplate={template}
          isEditing={false}
          preventRedirect={true}
          useDialog={false}
        />
      </div>
    </div>
  );
};
