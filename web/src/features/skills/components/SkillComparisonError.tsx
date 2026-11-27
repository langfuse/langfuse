import { Button } from "@/src/components/design-system/Button/Button";

export function SkillComparisonError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 text-sm">
      <p>Could not load the comparison. Please try again.</p>
      <Button text="Retry" variant="secondary" onClick={retry} />
    </div>
  );
}
