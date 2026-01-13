import { PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useState } from "react";

type UsageDetailsEditorProps = {
  usageDetails: Record<string, number>;
  onChange: (usageDetails: Record<string, number>) => void;
};

export type { UsageDetailsEditorProps };

export function UsageDetailsEditor({
  usageDetails,
  onChange,
}: UsageDetailsEditorProps) {
  const [entries, setEntries] = useState<Array<{ key: string; value: number }>>(
    Object.entries(usageDetails).map(([key, value]) => ({ key, value })),
  );

  const handleUpdate = (newEntries: Array<{ key: string; value: number }>) => {
    setEntries(newEntries);
    const newUsageDetails = Object.fromEntries(
      newEntries
        .filter((e) => e.key.trim() !== "")
        .map((e) => [e.key, e.value]),
    );
    onChange(newUsageDetails);
  };

  const handleAddRow = () => {
    handleUpdate([...entries, { key: "", value: 0 }]);
  };

  const handleRemoveRow = (index: number) => {
    handleUpdate(entries.filter((_, i) => i !== index));
  };

  const handleKeyChange = (index: number, key: string) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], key };
    handleUpdate(newEntries);
  };

  const handleValueChange = (index: number, value: number) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], value };
    handleUpdate(newEntries);
  };

  const applyTemplate = (template: Record<string, number>) => {
    const newEntries = Object.entries(template).map(([key, value]) => ({
      key,
      value,
    }));
    handleUpdate(newEntries);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="pb-2 text-sm font-medium">Usage Details (optional)</div>
        <div className="text-sm text-muted-foreground">
          Add usage details to test pricing tier matching. Leave empty to match
          the default tier.
        </div>
      </div>

      {/* Template Buttons */}
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          Prefill from template:
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              applyTemplate({
                input: 1000,
                output: 500,
              })
            }
          >
            OpenAI
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              applyTemplate({
                input_tokens: 1000,
                output_tokens: 500,
                cache_read_input_tokens: 0,
              })
            }
          >
            Anthropic
          </Button>
        </div>
      </div>

      {/* Usage Details Table */}
      {entries.length > 0 ? (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="grid grid-cols-[1fr,1fr,auto] gap-2 text-sm font-medium">
            <div>Usage Type</div>
            <div>Value</div>
            <div className="w-10" />
          </div>
          {entries.map((entry, index) => (
            <div key={index} className="grid grid-cols-[1fr,1fr,auto] gap-2">
              <Input
                placeholder="e.g. input"
                value={entry.key}
                onChange={(e) => handleKeyChange(index, e.target.value)}
              />
              <Input
                type="number"
                placeholder="0"
                value={entry.value}
                onChange={(e) =>
                  handleValueChange(index, parseFloat(e.target.value) || 0)
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveRow(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        onClick={handleAddRow}
        className="w-full"
      >
        <PlusCircle className="mr-2 h-4 w-4" />
        Add Usage Type
      </Button>
    </div>
  );
}
