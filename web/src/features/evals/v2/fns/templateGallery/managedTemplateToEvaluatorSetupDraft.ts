import type {
  EvaluatorSetupDraft,
  ManagedTemplate,
} from "@/src/features/evals/v2/types/templateGallery";

function managedTemplateDefinition(
  evaluator: ManagedTemplate["evaluator"],
): EvaluatorSetupDraft["definition"] {
  switch (evaluator.type) {
    case "LLM_AS_JUDGE":
      return {
        type: evaluator.type,
        promptMessages: evaluator.promptMessages,
        provider: null,
        model: null,
        modelParams: null,
        vars: evaluator.variables.map(({ name }) => name),
        variableMapping: evaluator.variables.map(
          ({ name, defaultMapping }) => ({
            templateVariable: name,
            selectedColumnId: defaultMapping.field,
            jsonSelector: null,
          }),
        ),
        outputDefinition: evaluator.outputDefinition,
      };
    case "CODE":
      return {
        type: evaluator.type,
        sourceCode: evaluator.source,
        sourceCodeLanguage: evaluator.language,
      };
    case "DECISION_MODEL":
      // Templates never pin a connection; the empty model leaves the picker
      // unselected so the user chooses their TypeSafe connection.
      return {
        type: evaluator.type,
        questions: evaluator.questions,
        provider: "",
        model: "",
        vars: evaluator.state.map(({ key }) => key),
        variableMapping: evaluator.state.map(({ key, defaultMapping }) => ({
          templateVariable: key,
          selectedColumnId: defaultMapping.field,
          jsonSelector: null,
        })),
      };
  }
}

export function managedTemplateToEvaluatorSetupDraft(
  template: ManagedTemplate,
): EvaluatorSetupDraft {
  return {
    name: template.name,
    description: template.description,
    definition: managedTemplateDefinition(template.evaluator),
  };
}
