import Decimal from "decimal.js";
import { registerCustom } from "superjson";

export const setUpSuperjson = () => {
  registerCustom<Decimal, string>(
    {
      isApplicable: (v): v is Decimal => Decimal.isDecimal(v),
      serialize: (v) => v.toJSON(),
      deserialize: (v) => new Decimal(v),
    },
    "decimal.js",
  );
};
