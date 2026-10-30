import {
  EvalTemplateType,
  observationVariableMappingList,
} from "@langfuse/shared";
import { prepareModernRuleVariableMapping } from "@/src/features/evals/v2/fns/variableMapping/prepareModernRuleVariableMapping";
import type {
  RuleDraft,
  RuleTableRow,
} from "@/src/features/evals/v2/types/rules";

export function prepareRuleCloneDraft(
  rule: Pick<RuleTableRow, "name" | "filter" | "sampling" | "assignments">,
): RuleDraft {
  return {
    name: `${rule.name} copy`,
    filter: rule.filter,
    sampling: rule.sampling,
    assignments: rule.assignments.map((assignment) => {
      const preparedDefault = prepareModernRuleVariableMapping(
        assignment.evaluator.latestVersion?.variableMapping,
        assignment.evaluator.type,
      );
      return {
        evaluatorId: assignment.evaluator.id,
        evaluatorName: assignment.evaluator.name,
        evaluatorType: assignment.evaluator.type,
        defaultVariableMapping: preparedDefault.defaultVariableMapping,
        variableMapping:
          assignment.evaluator.type === EvalTemplateType.CODE ||
          assignment.variableMapping == null
            ? preparedDefault.initialVariableMapping
            : observationVariableMappingList
                .catch([])
                .parse(assignment.variableMapping),
      };
    }),
  };
}
