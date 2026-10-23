import type { EvalTemplateType } from "@langfuse/shared";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";

// Funnel for creating an evaluator: gallery -> setup page -> saved dialog.
// Metadata only — enums, counts, lengths, booleans and Langfuse-owned template
// or section keys. Never search text, prompt content, evaluator/rule names,
// filter values or custom template ids.

type EvaluatorContext = { evaluatorType: EvalTemplateType };

type ExecutionPath = "test_filters" | "existing_rule" | "new_rule";

type Execution = {
  executionPath: ExecutionPath;
  hasBackfill: boolean;
  // Unknown for a rule created in the rule editor.
  samplingPercent?: number;
};

type TemplateSelection = EvaluatorContext & {
  managedTemplateKey?: string;
  isCustomTemplate: boolean;
};

type OnboardingStep =
  | (EvaluatorContext & {
      stepName: "new_from_scratch_selected";
      surface: "gallery";
    })
  | (TemplateSelection & {
      stepName: "suggestion_selected";
      surface: "gallery" | "empty_state";
    })
  | (TemplateSelection & {
      stepName: "template_selected";
      surface: "gallery";
      sectionKey: string;
    })
  | (EvaluatorContext & {
      stepName: "model_selected";
      modelMode: "default" | "custom";
    })
  | (EvaluatorContext & { stepName: "score_output_modified" })
  | (EvaluatorContext & {
      stepName: "variable_mapping_updated";
      method: "tree" | "json_path";
    })
  | (EvaluatorContext & { stepName: "evaluator_name_updated" })
  | (EvaluatorContext & {
      stepName: "evaluator_filter_changed";
      filterExperience: EvaluatorFilterExperience;
      filterCount: number;
    })
  | (EvaluatorContext & { stepName: "evaluator_tested" })
  | (EvaluatorContext & { stepName: "evaluator_saved"; isBlocked: boolean })
  | (EvaluatorContext & Execution & { stepName: "execute" });

export type EvalOnboardingEventMap = {
  "eval:onboarding_started": {
    entryPoint:
      | "new_evaluator_button"
      | "empty_state_starting_point"
      | "empty_state_browse_templates"
      | "clone_evaluator"
      | "batch_evaluation";
    hasExistingEvaluators?: boolean;
  };
  // Fires at most once per step and setup attempt; the interaction events
  // below fire on every action.
  "eval:onboarding_step_completed": OnboardingStep;
  "eval:onboarding_completed": EvaluatorContext & Execution;
  "eval:onboarding_gallery_searched": { queryLength: number };
  "eval:onboarding_gallery_section_selected": { sectionKey: string };
  "eval:onboarding_evaluator_type_changed": EvaluatorContext & {
    previousEvaluatorType: EvalTemplateType;
  };
  "eval:onboarding_preview_toggled": EvaluatorContext & { isEnabled: boolean };
  "eval:onboarding_sample_observation_previewed": EvaluatorContext;
  // `message_edited` (content or role, typed) fires once per setup attempt;
  // adding, removing and reordering messages fire on every action.
  "eval:onboarding_prompt_modified": EvaluatorContext & {
    modification:
      | "message_edited"
      | "message_added"
      | "message_removed"
      | "messages_reordered";
  };
  "eval:onboarding_llm_connection_tab_opened": EvaluatorContext;
  "eval:onboarding_model_picker_opened": EvaluatorContext;
  "eval:onboarding_model_changed": EvaluatorContext & {
    modelMode: "default" | "custom";
  };
  "eval:onboarding_ai_generate_requested": EvaluatorContext & {
    field: "name" | "description";
  };
  // Once per setup attempt: the slider reports every drag tick. The final
  // value is on `eval:onboarding_completed`.
  "eval:onboarding_sampling_changed": EvaluatorContext;
  "eval:onboarding_historic_eval_toggled": EvaluatorContext & {
    isEnabled: boolean;
  };
  "eval:onboarding_scope_changed": EvaluatorContext & {
    scope: "test_filters" | "different_scope";
  };
  "eval:onboarding_create_rule_opened": EvaluatorContext;
  "eval:onboarding_execution_skipped": EvaluatorContext & {
    method: "skip_button" | "dialog_dismissed" | "rule_editor_closed";
  };
};
