export function getSetupStepStatus(step: number, activeStep: number) {
  if (step < activeStep) return "complete" as const;
  if (step === activeStep) return "current" as const;
  return "upcoming" as const;
}
