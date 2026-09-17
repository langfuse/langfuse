import {
  EvalTemplateType,
  observationVariableMappingList,
} from "@langfuse/shared";
import { prepareModernRuleVariableMapping } from "../variableMapping/prepareModernRuleVariableMapping";
import type { RuleDraft, RuleTableRow } from "../../types/rules";

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
