import Decimal from "decimal.js";

import { PriceMapSchema } from "@/src/features/models/validation";
import { getMaxDecimals } from "@/src/features/models/utils";

export function PricePreview({
  prices,
}: {
  prices: Record<string, number | undefined>;
}) {
  const parsedPrices = PriceMapSchema.safeParse(prices);

  const getMaxDecimalsForPriceGroup = (
    price: number | undefined,
    multiplier: number,
  ) => {
    return price != null
      ? Math.max(
          ...Object.values(prices).map((price) => {
            return getMaxDecimals(price, multiplier);
          }),
        )
      : 0;
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Price Preview
          </h4>
        </div>

        {parsedPrices.success ? (
          <div className="space-y-2">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-border pb-2 text-xs font-medium text-muted-foreground">
              <span>Usage Type</span>
              <span className="text-right">per unit</span>
              <span className="text-right">per 1K</span>
              <span className="text-right">per 1M</span>
            </div>

            {Object.entries(parsedPrices.data)
              .filter((entry): entry is [string, number] => Boolean(entry[1]))
              .map(([usageType, price]) => (
                <div
                  key={usageType}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 rounded px-1 py-0.5 text-xs text-muted-foreground"
                >
                  <span className="break-all font-medium">{usageType}</span>
                  <span className="text-right font-mono">
                    $
                    {new Decimal(price).toFixed(
                      getMaxDecimalsForPriceGroup(price, 1),
                    )}
                  </span>
                  <span className="text-right font-mono">
                    $
                    {new Decimal(price)
                      .mul(1000)
                      .toFixed(getMaxDecimalsForPriceGroup(price, 1000))}
                  </span>
                  <span className="text-right font-mono">
                    $
                    {new Decimal(price)
                      .mul(1000000)
                      .toFixed(getMaxDecimalsForPriceGroup(price, 1000000))}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Invalid price entries. Please check your input format.
          </div>
        )}
      </div>
    </div>
  );
}
