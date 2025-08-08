import { cn } from "@/src/utils/tailwind";

interface SurveyProgressProps {
  currentStep: number;
  totalSteps: number;
  className?: string;
}

export function SurveyProgress({
  currentStep,
  totalSteps,
  className,
}: SurveyProgressProps) {
  return (
    <div className={cn("flex w-full gap-3", className)}>
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "h-1 flex-1 rounded-full transition-colors duration-300",
            index <= currentStep ? "bg-primary" : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}
