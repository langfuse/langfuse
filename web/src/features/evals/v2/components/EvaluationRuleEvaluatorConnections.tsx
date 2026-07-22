import { useState } from "react";
import Link from "next/link";
import { ExternalLink, ListTree, MoreVertical, Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { getEvaluationRuleTracesHref } from "@/src/features/evals/v2/lib/evaluationRuleTracesHref";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

export function EvaluationRuleEvaluatorConnections({
  projectId,
  ruleId,
  evaluators,
  hasWriteAccess,
}: {
  projectId: string;
  ruleId: string;
  evaluators: Array<{ id: string; scoreName: string }>;
  hasWriteAccess: boolean;
}) {
  const utils = api.useUtils();
  const [evaluatorToDetach, setEvaluatorToDetach] = useState<
    (typeof evaluators)[number] | null
  >(null);
  const detachEvaluator = api.evalsV2.detachEvaluatorFromRule.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: async (_data, variables) => {
      const detachedEvaluator = evaluators.find(
        (evaluator) => evaluator.id === variables.evaluatorId,
      );
      setEvaluatorToDetach(null);
      showSuccessToast({
        title: "Evaluator detached",
        description: detachedEvaluator
          ? `“${detachedEvaluator.scoreName}” is no longer attached to this evaluation rule.`
          : "The evaluator is no longer attached to this evaluation rule.",
      });
      await Promise.all([utils.evalsV2.invalidate(), utils.evals.invalidate()]);
    },
  });

  if (evaluators.length === 0) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
        No evaluators are attached to this evaluation rule.
      </div>
    );
  }

  return (
    <>
      <ul
        className="divide-border divide-y overflow-hidden rounded-md border"
        aria-label="Attached evaluators"
      >
        {evaluators.map((evaluator) => (
          <li
            key={evaluator.id}
            className="hover:bg-muted/50 flex min-w-0 items-center px-1 py-1 text-sm transition-colors"
          >
            <Button
              variant="link"
              size="sm"
              className="text-foreground hover:text-foreground min-w-0 flex-1 justify-start overflow-hidden px-2 font-normal hover:no-underline"
              asChild
            >
              <Link
                href={`/project/${projectId}/evals/v2/${encodeURIComponent(evaluator.id)}`}
              >
                <span className="truncate" title={evaluator.scoreName}>
                  {evaluator.scoreName}
                </span>
              </Link>
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" asChild>
                  <Link
                    href={getEvaluationRuleTracesHref({
                      projectId,
                      evaluatorId: evaluator.id,
                      ruleId,
                    })}
                    aria-label={`View execution traces for ${evaluator.scoreName}`}
                  >
                    <ListTree className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View traces</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`More actions for ${evaluator.scoreName}`}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link
                    href={`/project/${projectId}/evals/v2/${encodeURIComponent(evaluator.id)}`}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View evaluator
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasWriteAccess}
                  onSelect={() => setEvaluatorToDetach(evaluator)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Detach
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={evaluatorToDetach !== null}
        onOpenChange={(open) => {
          if (!open) setEvaluatorToDetach(null);
        }}
        title="Detach evaluator from rule?"
        description={
          evaluatorToDetach
            ? `“${evaluatorToDetach.scoreName}” will stop running on data matched by this rule. The evaluator and its other rule attachments are unchanged.`
            : undefined
        }
        confirmLabel="Detach"
        loading={detachEvaluator.isPending}
        onConfirm={async () => {
          if (!evaluatorToDetach) return;
          await detachEvaluator.mutateAsync({
            projectId,
            evaluatorId: evaluatorToDetach.id,
            ruleId,
          });
        }}
      />
    </>
  );
}
