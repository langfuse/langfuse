import { Button } from "@/src/components/ui/button";
import { FormDescription } from "@/src/components/ui/form";

type TierPrefillButtonsProps = {
  onPrefill: (usageTypes: string[]) => void;
};

export type { TierPrefillButtonsProps };

const TEMPLATES: { label: string; usageTypes: string[] }[] = [
  {
    label: "OpenAI",
    usageTypes: [
      "input",
      "output",
      "input_cached_tokens",
      "output_reasoning_tokens",
    ],
  },
  {
    label: "Anthropic",
    usageTypes: [
      "input",
      "input_tokens",
      "output",
      "output_tokens",
      "cache_creation_input_tokens",
      "cache_read_input_tokens",
      "input_cache_creation_5m",
      "input_cache_creation_1h",
    ],
  },
];

export function TierPrefillButtons({ onPrefill }: TierPrefillButtonsProps) {
  return (
    <div className="space-y-2">
      <FormDescription>Prefill usage types from template:</FormDescription>
      <div className="flex gap-2">
        {TEMPLATES.map((template) => (
          <Button
            key={template.label}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPrefill(template.usageTypes)}
          >
            {template.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
