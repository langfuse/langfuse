/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/src/app/design-system/legacy-primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/app/design-system/legacy-primitives/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/app/design-system/legacy-primitives/select";
import { PriceUnit } from "@/src/ai/model-catalog/validation";
import { usePriceUnitMultiplier } from "@/src/ai/model-catalog/hooks/usePriceUnitMultiplier";

export const PriceUnitSelector = () => {
  const { priceUnit, setPriceUnit } = usePriceUnitMultiplier();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost">
          <ChevronDownIcon className="icon-base text-icon-foreground" />
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
