/* eslint-disable @repo/no-null-render */
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useDebounce } from "@/src/hooks/useDebounce";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EditRuleDialogContent } from "@/src/features/evals/v2/components/Rules/EditRuleDialog/components/EditRuleDialogContent/EditRuleDialogContent";
import type { RuleEvaluatorOption } from "@/src/features/evals/v2/types/rules";
import { prepareModernRuleVariableMapping } from "@/src/features/evals/v2/fns/variableMapping/prepareModernRuleVariableMapping";
import { api } from "@/src/utils/api";
import {
  getRuleNavigationAction,
  getRuleNavigationUrl,
} from "@/src/features/evals/v2/utils/ruleNavigation";

export function EditRuleDialog({
  projectId,
  ruleId,
  hasWriteAccess,
  onOpenChange,
}: {
  projectId: string;
  ruleId: string;
  hasWriteAccess: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const rule = api.evalsV2.rules.get.useQuery({ projectId, ruleId });
  const [evaluatorSearch, setEvaluatorSearch] = useState("");
  const [evaluatorSearchQuery, setEvaluatorSearchQuery] = useState("");
  const debouncedEvaluatorSearch = useDebounce(
    setEvaluatorSearchQuery,
    300,
    false,
  );
  const evaluatorOptions = api.evalsV2.options.useQuery({
    projectId,
    limit: 100,
    search: evaluatorSearchQuery.trim() || undefined,
  });
  const options: RuleEvaluatorOption[] = (evaluatorOptions.data ?? []).map(
    (evaluator) => ({
      id: evaluator.id,
      name: evaluator.name,
      type: evaluator.type,
      updatedAt: evaluator.updatedAt,
      createdByUser: evaluator.createdByUser,
      ...prepareModernRuleVariableMapping(
        evaluator.latestVersion?.variableMapping,
        evaluator.type,
      ),
    }),
  );
  const navigationAction = rule.data
    ? getRuleNavigationAction(rule.data)
    : null;
  const navigationUrl = rule.data
    ? getRuleNavigationUrl({
        projectId,
        ruleId,
        targetObject: rule.data.targetObject,
        enabled: rule.data.enabled,
      })
    : null;

  // Bookmarked `?rule=` links bypass table click routing. Once the rule loads,
  // synchronize the external router before any legacy data reaches the modern editor.
  useEffect(() => {
    if (!navigationAction || navigationAction === "edit") return;

    if (navigationAction === "remap" && navigationUrl) {
      router.replace(navigationUrl);
      return;
    }

    const { rule: _rule, ...query } = router.query;
    router.replace(
      {
        pathname: router.pathname,
        query: { ...query, peek: ruleId },
      },
      undefined,
      { shallow: true },
    );
  }, [navigationAction, navigationUrl, router, ruleId]);

  if (navigationAction && navigationAction !== "edit") return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-w-6xl" closeOnInteractionOutside>
        <DialogHeader>
          <DialogTitle>{rule.data?.name ?? "Evaluation rule"}</DialogTitle>
        </DialogHeader>
        {rule.isPending || !rule.data ? (
          <DialogBody>
            <Skeleton className="h-96 w-full" />
          </DialogBody>
        ) : (
          <EditRuleDialogContent
            key={rule.data.id}
            projectId={projectId}
            rule={rule.data}
            evaluatorOptions={options}
            evaluatorSearch={evaluatorSearch}
            onEvaluatorSearchChange={(value) => {
              setEvaluatorSearch(value);
              debouncedEvaluatorSearch(value);
            }}
            hasWriteAccess={hasWriteAccess}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
