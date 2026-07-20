import { useState } from "react";
import Link from "next/link";
import { ExternalLink, MoreVertical, Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { getRunScopeTracesHref } from "@/src/features/evals/v2/lib/runScopeTracesHref";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

export function RunScopeEvaluatorConnections({
  projectId,
  runScopeId,
  evaluators,
  hasWriteAccess,
}: {
  projectId: string;
  runScopeId: string;
  evaluators: Array<{ id: string; scoreName: string }>;
  hasWriteAccess: boolean;
}) {
  const utils = api.useUtils();
  const [evaluatorToDelete, setEvaluatorToDelete] = useState<
    (typeof evaluators)[number] | null
  >(null);
  const deleteEvaluator = api.evalsV2.deleteEvaluators.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: async () => {
      setEvaluatorToDelete(null);
      showSuccessToast({
        title: "Evaluator deleted",
        description: "The evaluator has been deleted successfully.",
      });
      await Promise.all([utils.evalsV2.invalidate(), utils.evals.invalidate()]);
    },
  });

  if (evaluators.length === 0) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
        No evaluators are attached to this run scope.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {evaluators.map((evaluator) => (
          <div
            key={evaluator.id}
            className="flex min-w-0 items-center rounded-md border px-1 text-sm"
          >
            <span
              className="min-w-0 flex-1 truncate px-2"
              title={evaluator.scoreName}
            >
              {evaluator.scoreName}
            </span>
            <Button variant="ghost" size="sm" asChild>
              <Link
                href={getRunScopeTracesHref({
                  projectId,
                  evaluatorId: evaluator.id,
                  runScopeId,
                })}
                aria-label={`View execution traces for ${evaluator.scoreName}`}
              >
                View traces
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
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
                  onSelect={() => setEvaluatorToDelete(evaluator)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={evaluatorToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setEvaluatorToDelete(null);
        }}
        title="Delete evaluator?"
        description={
          evaluatorToDelete
            ? `This permanently deletes “${evaluatorToDelete.scoreName}” and disconnects it from all run scopes. This action cannot be undone.`
            : undefined
        }
        confirmLabel="Delete evaluator"
        loading={deleteEvaluator.isPending}
        onConfirm={async () => {
          if (!evaluatorToDelete) return;
          await deleteEvaluator.mutateAsync({
            projectId,
            evaluatorIds: [evaluatorToDelete.id],
          });
        }}
      />
    </>
  );
}
