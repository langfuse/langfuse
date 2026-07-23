import { useState } from "react";
import Link from "next/link";
import {
  Eye,
  Link2,
  ListTree,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Label } from "@/src/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { CreateEvaluationRuleDialog } from "@/src/features/evals/v2/components/CreateEvaluationRuleDialog";
import { EvaluationRuleAttachmentValidationAlert } from "@/src/features/evals/v2/components/EvaluationRuleAttachmentValidationAlert";
import { EvaluationRuleAttachmentValidationDialog } from "@/src/features/evals/v2/components/EvaluationRuleAttachmentValidationDialog";
import { EvaluationRulePicker } from "@/src/features/evals/v2/components/EvaluationRulePicker";
import { useValidatedRuleAttachment } from "@/src/features/evals/v2/hooks/useValidatedRuleAttachment";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { getEvaluationRuleTracesHref } from "@/src/features/evals/v2/lib/evaluationRuleTracesHref";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type FilterState } from "@langfuse/shared";

export function EvaluatorRuleAssignments({
  projectId,
  evaluatorId,
  evaluatorName,
  rules,
  rulePickerInitiallyOpen = false,
  hasWriteAccess,
  onView,
  onEdit,
}: {
  projectId: string;
  evaluatorId: string;
  evaluatorName: string;
  rules: Array<{
    id: string;
    name: string;
    filter: FilterState;
    enabled: boolean;
  }>;
  rulePickerInitiallyOpen?: boolean;
  hasWriteAccess: boolean;
  onView: (ruleId: string) => void;
  onEdit: (ruleId: string) => void;
}) {
  const utils = api.useUtils();
  const attachment = useValidatedRuleAttachment({
    projectId,
    entryPoint: "evaluator_detail",
  });
  const [rulePickerOpen, setRulePickerOpen] = useState(rulePickerInitiallyOpen);
  const [createRuleDialogOpen, setCreateRuleDialogOpen] = useState(false);
  const [ruleToDetach, setRuleToDetach] = useState<
    (typeof rules)[number] | null
  >(null);
  const availableRules = api.evalsV2.rules.useQuery(
    { projectId },
    { enabled: rulePickerOpen },
  );
  const attachedRuleIds = new Set(rules.map((rule) => rule.id));
  const compatibleRules = (availableRules.data ?? []).filter(
    (rule) => rule.targetObject === "event",
  );
  const unattachedRules = compatibleRules.filter(
    (rule) => !attachedRuleIds.has(rule.id),
  );
  const attachRule = (rule: (typeof unattachedRules)[number]) => {
    attachment
      .attach({
        evaluatorId,
        ruleId: rule.id,
        evaluatorName,
        evaluationRuleName: rule.name,
      })
      .catch(() => undefined);
  };
  const detachRule = api.evalsV2.detachEvaluatorFromRule.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: (_data, variables) => {
      const detachedRule = rules.find((rule) => rule.id === variables.ruleId);
      setRuleToDetach(null);
      showSuccessToast({
        title: "Evaluator detached",
        description: detachedRule
          ? `This evaluator is no longer attached to “${detachedRule.name}”.`
          : "This evaluator is no longer attached to the selected rule.",
      });
      Promise.all([
        utils.evals.configById.invalidate({ projectId, id: evaluatorId }),
        utils.evalsV2.invalidate(),
      ]).catch(() => undefined);
    },
  });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label>Rules</Label>
        <EvaluationRulePicker
          trigger={(open) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              role="combobox"
              aria-label="Attach to rule"
              aria-expanded={open}
              loading={attachment.pendingKey !== null}
              disabled={!hasWriteAccess || attachment.pendingKey !== null}
            >
              <span className="flex items-center">
                <Link2 className="mr-1.5 h-3.5 w-3.5" />
                Attach to rule
              </span>
            </Button>
          )}
          availableRules={unattachedRules}
          initiallyOpen={rulePickerInitiallyOpen}
          loading={availableRules.isPending}
          align="end"
          onOpenChange={setRulePickerOpen}
          onSelectAvailableRule={attachRule}
          onCreateRule={() => setCreateRuleDialogOpen(true)}
        />
      </div>

      {rules.length > 0 ? (
        <ul
          className="divide-border divide-y overflow-hidden rounded-md border"
          aria-label="Attached rules"
        >
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="hover:bg-muted/50 flex min-w-0 items-center px-1 py-1 text-sm transition-colors"
            >
              <Button
                type="button"
                variant="link"
                size="sm"
                className="text-foreground hover:text-foreground min-w-0 flex-1 justify-start overflow-hidden px-2 font-normal hover:no-underline"
                onClick={() => onView(rule.id)}
              >
                <span className="truncate" title={rule.name}>
                  {rule.name}
                </span>
              </Button>
              <Badge
                variant={rule.enabled ? "success" : "secondary"}
                size="sm"
                className="mr-1 shrink-0"
              >
                {rule.enabled ? "Active" : "Inactive"}
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-xs" asChild>
                    <Link
                      href={getEvaluationRuleTracesHref({
                        projectId,
                        evaluatorId,
                        ruleId: rule.id,
                      })}
                      aria-label={`View execution traces for ${rule.name}`}
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
                    aria-label={`More actions for ${rule.name}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onView(rule.id)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View rule
                  </DropdownMenuItem>
                  {hasWriteAccess ? (
                    <>
                      <DropdownMenuItem onSelect={() => onEdit(rule.id)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setRuleToDetach(rule)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Detach
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
          This evaluator is not attached to any rules.
        </div>
      )}

      {attachment.issue ? (
        <EvaluationRuleAttachmentValidationAlert
          projectId={projectId}
          evaluatorId={attachment.issue.evaluatorId}
          ruleId={attachment.issue.ruleId}
          issue={attachment.issue}
        />
      ) : null}

      <EvaluationRuleAttachmentValidationDialog
        open={attachment.pendingKey !== null}
      />

      {createRuleDialogOpen ? (
        <CreateEvaluationRuleDialog
          projectId={projectId}
          open
          initialEvaluatorIds={[evaluatorId]}
          onOpenChange={setCreateRuleDialogOpen}
        />
      ) : null}

      <ConfirmDialog
        open={ruleToDetach !== null}
        onOpenChange={(open) => {
          if (!open) setRuleToDetach(null);
        }}
        title="Detach evaluator from rule?"
        description={
          ruleToDetach
            ? `The evaluator will stop running on data matched by “${ruleToDetach.name}”.${rules.length === 1 ? " Since this is its only evaluation rule, the evaluator will become inactive." : ""}`
            : undefined
        }
        confirmLabel="Detach evaluator"
        loading={detachRule.isPending}
        onConfirm={() => {
          if (!ruleToDetach) return;
          detachRule.mutate({
            projectId,
            evaluatorId,
            ruleId: ruleToDetach.id,
          });
        }}
      />
    </section>
  );
}
