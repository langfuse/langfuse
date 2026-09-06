/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { ChevronDownIcon } from "lucide-react";

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
import { useTranslations } from "next-intl";

export const PriceUnitSelector = () => {
  const t = useTranslations("settingsEnterprise.models.pricingEditor");
  const { priceUnit, setPriceUnit } = usePriceUnitMultiplier();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost">
          <ChevronDownIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Select
          value={priceUnit}
          onValueChange={(value: PriceUnit) => setPriceUnit(value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("selectUnit")} />
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
