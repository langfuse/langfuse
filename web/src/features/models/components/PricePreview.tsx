import Decimal from "decimal.js";

import { getMaxDecimals } from "@/src/features/models/fns/getMaxDecimals";

/**
 * Preview of the rows that currently hold a valid price. Rows that are
 * mid-edit are simply absent — field-level messages own their errors.
 */
export function PricePreview({
  prices,
}: {
  // `key` is the usage type's row identity: names can collide while editing.
  prices: { key: string; usageType: string; price: number }[];
}) {
  // One scale per column, shared by every row so the decimal points line up.
  const decimalsFor = (multiplier: number) =>
    prices.length === 0
      ? 0
      : Math.max(
          ...prices.map(({ price }) => getMaxDecimals(price, multiplier)),
        );
  const decimals = {
    unit: decimalsFor(1),
    per1K: decimalsFor(1000),
    per1M: decimalsFor(1000000),
  };

  return (
    <div className="border-border bg-muted/30 rounded-lg border p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h4 className="text-muted-foreground text-sm font-bold">
            Price Preview
          </h4>
        </div>

        <div className="space-y-2">
          <div className="border-border text-muted-foreground grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b pb-2 text-xs font-bold">
            <span>Usage Type</span>
            <span className="text-right">per unit</span>
            <span className="text-right">per 1K</span>
            <span className="text-right">per 1M</span>
          </div>

          {prices.map(({ key, usageType, price }) => (
            <div
              key={key}
              className="text-muted-foreground grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 rounded px-1 py-0.5 text-xs"
            >
              <span className="font-bold break-all">{usageType}</span>
              <span className="text-right font-mono">
                ${new Decimal(price).toFixed(decimals.unit)}
              </span>
              <span className="text-right font-mono">
                ${new Decimal(price).mul(1000).toFixed(decimals.per1K)}
              </span>
              <span className="text-right font-mono">
                ${new Decimal(price).mul(1000000).toFixed(decimals.per1M)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
