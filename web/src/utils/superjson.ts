import Decimal from "decimal.js";
import { registerCustom } from "superjson";

// Superjson throws while walking an own key named `__proto__`, `constructor`,
// or `prototype`. Tool names and other caller-controlled map keys can be those
// strings, so carry the record as entries and rebuild the own properties.
const SUPERJSON_RESERVED_KEYS = ["__proto__", "constructor", "prototype"];

type JsonPrimitive = string | number | boolean | null;

const isJsonPrimitive = (value: unknown): value is JsonPrimitive =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const isReservedPlainObject = (
  value: unknown,
): value is Record<string, JsonPrimitive> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (
    !SUPERJSON_RESERVED_KEYS.some((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  ) {
    return false;
  }
  return Object.values(value).every(isJsonPrimitive);
};

const defineOwn = (
  record: Record<string, JsonPrimitive>,
  key: string,
  value: JsonPrimitive,
) => {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
};

export const setUpSuperjson = () => {
  registerCustom<Decimal, string>(
    {
      isApplicable: (v): v is Decimal => Decimal.isDecimal(v),
      serialize: (v) => v.toJSON(),
      deserialize: (v) => new Decimal(v),
    },
    "decimal.js",
  );

  registerCustom<Record<string, JsonPrimitive>, Array<[string, JsonPrimitive]>>(
    {
      isApplicable: (v): v is Record<string, JsonPrimitive> =>
        isReservedPlainObject(v),
      serialize: (v) => Object.entries(v),
      deserialize: (entries) => {
        const record: Record<string, JsonPrimitive> = {};
        for (const [key, value] of entries) {
          defineOwn(record, key, value);
        }
        return record;
      },
    },
    "reserved-object-keys",
  );
};
