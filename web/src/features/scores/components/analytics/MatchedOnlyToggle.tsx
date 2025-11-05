import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";

interface MatchedOnlyToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Toggle component for filtering score analytics by matched scores only
 *
 * - OFF (default): Show all scores for distributions and time series
 * - ON: Show only scores that can be matched between the two score sets
 *
 * This ensures consistency between visualizations when users want to focus
 * on paired comparisons only.
 */
export function MatchedOnlyToggle({
  value,
  onChange,
  disabled = false,
  className,
}: MatchedOnlyToggleProps) {
  return (
    <div className={`flex items-center space-x-2 ${className ?? ""}`}>
      <Switch
        id="matched-only"
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label="Show only matched scores"
      />
      <Label
        htmlFor="matched-only"
        className={`text-sm ${disabled ? "text-muted-foreground" : "cursor-pointer"}`}
      >
        Matched only
      </Label>
    </div>
  );
}
