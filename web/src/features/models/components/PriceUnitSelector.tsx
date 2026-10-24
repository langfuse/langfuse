/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { ChevronDownIcon } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { PriceUnit } from "@/src/features/models/validation";
import { usePriceUnitMultiplier } from "@/src/features/models/hooks/usePriceUnitMultiplier";

export const PriceUnitSelector = () => {
  const { priceUnit, setPriceUnit } = usePriceUnitMultiplier();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost">
          <ChevronDownIcon size="base" color="default" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Select
          value={priceUnit}
          onValueChange={(value: PriceUnit) => setPriceUnit(value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select unit" />
          </SelectTrigger>
          <SelectContent>
            {Object.values(PriceUnit).map((unit) => (
              <SelectItem key={unit} value={unit}>
                {unit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PopoverContent>
    </Popover>
  );
};
