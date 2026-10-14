import { CheckIcon } from "lucide-react";

import { DropdownIndicator } from "@/src/app/design-system/DropdownIndicator/DropdownIndicator";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
} from "@/src/app/design-system/legacy-primitives/input-command";
import { PopoverController } from "@/src/app/design-system/legacy-primitives/popover";
import { cn } from "@/src/app/utils/tailwind";

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
  const selectedDataset = datasets.find(
    (dataset) => dataset.id === selectedDatasetId,
  );

  return (
    <PopoverController
      align="start"
      contentClassName="w-(--radix-popover-trigger-width) overflow-auto p-0"
      disabled={false}
      modal={false}
      renderContent={({ closePopover }) => (
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
                    closePopover();
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
                      "icon-base ml-auto shrink-0",
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
      )}
    >
      {({ isOpen, Trigger }) => (
        <Trigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={isOpen}
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
        </Trigger>
      )}
    </PopoverController>
  );
}
