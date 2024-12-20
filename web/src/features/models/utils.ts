import Decimal from "decimal.js";

export const getMaxDecimals = (
  value: number | undefined,
  scaleMultiplier: number = 1,
) => {
  return (
    new Decimal(value ?? 0)
      .mul(scaleMultiplier)
      .toFixed(12)
      .split(".")[1]
      ?.replace(/0+$/, "").length ?? 0
  );
};
