import { ScoreTag } from "@/src/components/score-tag";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";

export function CorrectionScopeSelect({
  value,
  isDisabled,
  onChange,
}: CorrectionScopeSelectProps) {
  function handleScopeChange(scope: string) {
    if (scope !== "trace" && scope !== "observation") return;
    onChange(scope);
  }

  return (
    <Select
      value={value}
      disabled={isDisabled}
      onValueChange={handleScopeChange}
    >
      <SelectTrigger
        aria-label="Correction scope"
        disableValueLineClamp
        className="w-auto gap-2"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="trace">
          <ScoreTag level="trace" />
        </SelectItem>
        <SelectItem value="observation">
          <ScoreTag level="observation" />
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

type CorrectionScopeSelectProps = {
  value: "trace" | "observation";
  isDisabled: boolean;
  onChange: (scope: "trace" | "observation") => void;
};
