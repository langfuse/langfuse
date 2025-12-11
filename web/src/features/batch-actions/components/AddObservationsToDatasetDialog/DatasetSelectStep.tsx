import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/src/components/ui/command";
import { cn } from "@/src/utils/tailwind";
import { api } from "@/src/utils/api";
import type { DatasetSelectStepProps } from "./types";

export function DatasetSelectStep({
  projectId,
  dataset,
  onDatasetSelect,
}: DatasetSelectStepProps) {
  const [open, setOpen] = useState(false);

  // Fetch all datasets
  const datasets = api.datasets.allDatasetMeta.useQuery({
    projectId,
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-lg font-medium">Select Dataset</h3>
        <p className="text-sm text-muted-foreground">
          Choose an existing dataset to add your observations to
        </p>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between py-6 text-base"
          >
            {dataset.name || "Select dataset..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[500px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search datasets..." />
            <CommandEmpty>No dataset found.</CommandEmpty>
            <CommandGroup className="max-h-[300px] overflow-auto">
              {datasets.data?.map((d) => (
                <CommandItem
                  key={d.id}
                  value={d.name}
                  onSelect={() => {
                    onDatasetSelect(d);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center">
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        dataset.id === d.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span>{d.name}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
