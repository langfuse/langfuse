import { useState } from "react";
import { CheckIcon } from "lucide-react";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { Button } from "@/src/components/ui/button";
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
} from "@/src/components/ui/input-command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";

type DatasetPickerProps = {
  datasets: Array<{ id: string; name: string }>;
  selectedDatasetId: string | null;
  onSelect: (datasetId: string) => void;
};

export function DatasetPicker({
  datasets,
  selectedDatasetId,
  onSelect,
}: DatasetPickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDataset = datasets.find(
    (dataset) => dataset.id === selectedDatasetId,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="min-w-0 flex-1 justify-between gap-2 px-2 font-normal"
        >
          <span
            className="min-w-0 flex-1 truncate text-left"
            title={selectedDataset?.name}
          >
            {selectedDataset?.name ?? "Select a dataset"}
          </span>
          <DropdownIndicator />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) overflow-auto p-0"
        align="start"
      >
        <InputCommand>
          <InputCommandInput
            placeholder="Search datasets..."
            className="h-9"
            variant="bottom"
          />
          <InputCommandList>
            <InputCommandEmpty>No dataset found.</InputCommandEmpty>
            <InputCommandGroup>
              {datasets.map((dataset) => (
                <InputCommandItem
                  key={dataset.id}
                  onSelect={() => {
                    onSelect(dataset.id);
                    setOpen(false);
                  }}
                >
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={dataset.name}
                  >
                    {dataset.name}
                  </span>
                  <CheckIcon
                    className={cn(
                      "ml-auto h-4 w-4 shrink-0",
                      dataset.id === selectedDatasetId
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                </InputCommandItem>
              ))}
            </InputCommandGroup>
          </InputCommandList>
        </InputCommand>
      </PopoverContent>
    </Popover>
  );
}
