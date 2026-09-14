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
  // Emphasis, not alarm: the dominant number steps up to foreground colour and
  // medium weight; everything else stays in the row's muted grey.
  const cutOffs: [number, string][] = [
    // eslint-disable-next-line @repo/no-raw-font-weight -- approved: medium is the tree's emphasis weight
    [0.75, "text-foreground font-medium"], // 75%+
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
