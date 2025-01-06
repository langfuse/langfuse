import { useMemo } from "react";

import useLocalStorage from "@/src/components/useLocalStorage";
import { PriceUnit } from "@/src/features/models/validation";

export const multiplierMap: Record<PriceUnit, number> = {
  [PriceUnit.PerUnit]: 1,
  [PriceUnit.Per1KUnits]: 1e3,
  [PriceUnit.Per1MUnits]: 1e6,
};

export const usePriceUnitMultiplier = () => {
  const [priceUnit, setPriceUnit] = useLocalStorage<PriceUnit>(
    "priceUnit",
    PriceUnit.PerUnit,
  );
  const multiplier = useMemo(() => multiplierMap[priceUnit], [priceUnit]);

  return { priceUnit, setPriceUnit, priceUnitMultiplier: multiplier };
};
