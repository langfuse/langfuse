import Decimal from "decimal.js";

export const heatMapTextColor = (p: {
  min?: Decimal | number;
  max: Decimal | number;
  value: Decimal | number;
}) => {
  const { min, max, value } = p;
  const minDecimal = min ? new Decimal(min) : new Decimal(0);
  const maxDecimal = new Decimal(max);
  const valueDecimal = new Decimal(value);

  // A soft tint behind the number rather than coloured text: the metric stays
  // legible in the row's own grey and does not collide with the error red used
  // for observation levels.
  // One tint only: the point is "this is where the parent's time or cost
  // went", not a severity scale.
  const cutOffs: [number, string][] = [
    [0.5, "bg-light-yellow rounded-sm px-1 -mx-1"], // 50%+
  ];
  const standardizedValueOnStartEndScale = valueDecimal
    .sub(minDecimal)
    .div(maxDecimal.sub(minDecimal));
  const ratio = standardizedValueOnStartEndScale.toNumber();

  // pick based on ratio if threshold is exceeded
  for (const [threshold, color] of cutOffs) {
    if (ratio >= threshold) {
      return color;
    }
  }
  return "";
};
