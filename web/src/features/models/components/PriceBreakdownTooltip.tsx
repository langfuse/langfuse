import Decimal from "decimal.js";
import { InfoIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { type RowHeight } from "@/src/components/table/data-table-row-height-switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { usePriceUnitMultiplier } from "@/src/features/models/hooks/usePriceUnitMultiplier";
import { getMaxDecimals } from "@/src/features/models/utils";
import { type PriceUnit } from "@/src/features/models/validation";

export const PriceBreakdownTooltip = ({
  modelName,
  prices,
  priceUnit,
  rowHeight,
}: {
  modelName: string;
  prices?: Record<string, number>;
  priceUnit: PriceUnit;
  rowHeight: RowHeight;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { priceUnitMultiplier } = usePriceUnitMultiplier();

  const maxDecimals = useMemo(
    () =>
      Math.max(
        ...Object.values(prices ?? {}).map((price) => {
          return getMaxDecimals(price, priceUnitMultiplier);
        }),
      ),
    [prices, priceUnitMultiplier],
  );

  if (!prices) return null;

  return (
    <>
      {Object.keys(prices).length === 0 ? (
        <p>No prices</p>
      ) : Object.keys(prices).length <= (rowHeight === "m" ? 4 : 2) ? (
        <div className="grid w-full grid-cols-[2fr,3fr] gap-x-2">
          {Object.entries(prices).map(([type, price]) => (
            <>
              <span
                key={`${type}-label`}
                className="truncate font-mono text-xs font-medium"
                title={type}
              >
                {type}
              </span>
              <span
                key={`${type}-price`}
                className="text-left font-mono text-xs font-medium tabular-nums"
              >
                $
                {new Decimal(price)
                  .mul(priceUnitMultiplier)
                  .toFixed(maxDecimals)}
              </span>
            </>
          ))}
        </div>
      ) : (
        <TooltipProvider>
          <Tooltip open={isOpen} onOpenChange={setIsOpen}>
            <TooltipTrigger
              className="flex cursor-pointer items-center gap-2 pr-[1rem] text-xs"
              onClick={() => setIsOpen(!isOpen)}
            >
              <InfoIcon className="h-3 w-3" />
              {Object.keys(prices).length} prices set
            </TooltipTrigger>
            <TooltipContent className="min-w-[16rem] grow p-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">Price breakdown</span>
                  <span className="font-mono text-xs font-medium">
                    {modelName}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between font-mono text-xs font-semibold">
                    <span className="mr-4">Usage Type</span>
                    <span>Price {priceUnit}</span>
                  </div>
                  {Object.entries(prices).map(([usageType, price]) => (
                    <div
                      key={usageType}
                      className="flex justify-between font-mono text-xs"
                    >
                      <span className="mr-4">{usageType}</span>
                      <span>
                        {"$" +
                          new Decimal(price)
                            .mul(priceUnitMultiplier)
                            .toFixed(maxDecimals)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </>
  );
};
