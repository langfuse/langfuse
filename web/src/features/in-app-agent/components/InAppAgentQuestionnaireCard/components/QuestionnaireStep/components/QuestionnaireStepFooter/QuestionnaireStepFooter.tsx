import { Button } from "@/src/components/design-system/Button/Button";

export type QuestionnaireStepFooterProps = {
  actions: "skip" | "submit" | "skipAndSubmit";
  submitLabel: string;
  isDisabled: boolean;
  isSubmitDisabled: boolean;
  onSkip: () => void;
};

export function QuestionnaireStepFooter({
  actions,
  submitLabel,
  isDisabled,
  isSubmitDisabled,
  onSkip,
}: QuestionnaireStepFooterProps) {
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-2">
      {actions === "submit" ? null : (
        <Button
          text="Skip"
          variant="secondary"
          size="sm"
          disabled={isDisabled}
          onClick={onSkip}
        />
      )}
      {actions === "skip" ? null : (
        <Button
          text={submitLabel}
          size="sm"
          type="submit"
          disabled={isDisabled || isSubmitDisabled}
        />
      )}
    </div>
  );
}
