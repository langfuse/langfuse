type Discount = {
  code: string | null;
  name: string | null;
  kind: "percent" | "amount";
  /** A percentage, or an amount in the currency's minor units. */
  value: number;
  currency: string | null;
  duration: "forever" | "once" | "repeating" | null;
  durationInMonths: number | null;
};

const formatAmount = (minorUnits: number, currency: string | null) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency ?? "USD").toUpperCase(),
    currencyDisplay: "narrowSymbol",
  }).format(minorUnits / 100);

const durationText = ({ duration, durationInMonths }: Discount) => {
  if (duration === "once") return ", once";
  if (duration === "repeating" && durationInMonths) {
    return ` for ${durationInMonths} ${durationInMonths === 1 ? "month" : "months"}`;
  }
  return "";
};

/** A discount as a short label (its code, else its name) and what it takes off, for how long. */
export function formatDiscount(discount: Discount): {
  label: string;
  text: string;
} {
  const off =
    discount.kind === "percent"
      ? `${discount.value}% off`
      : `${formatAmount(discount.value, discount.currency)} off`;
  return {
    label: discount.code ?? discount.name ?? "Discount",
    text: `${off}${durationText(discount)}`,
  };
}
