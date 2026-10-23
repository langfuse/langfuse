import fc, { type Arbitrary } from "fast-check";

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

// Unicode and object-like key names are valid JSON data, including empty keys.
export const jsonKeyArbitrary = fc.oneof(
  { withCrossShrink: true },
  fc.string({ maxLength: 12, unit: "grapheme" }),
  fc.constantFrom("", "a.b", "__proto__", "constructor", "prototype", "🌍\n"),
);

// Bounded recursive JSON with finite numbers and shrinking from containers to
// leaves. Depth and width bound test cost without restricting JSON value kinds.
export function recursiveJsonArbitrary(
  depth: number,
  maxWidth: number,
): Arbitrary<Json> {
  const leaf = fc.oneof(
    { withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.string({ maxLength: 24, unit: "grapheme" }),
  ) as Arbitrary<Json>;
  if (depth === 0) return leaf;
  const child = recursiveJsonArbitrary(depth - 1, maxWidth);

  return fc.oneof(
    { withCrossShrink: true },
    { weight: 4, arbitrary: leaf },
    {
      weight: 2,
      arbitrary: fc.array(child, {
        maxLength: maxWidth,
      }),
    },
    {
      weight: 2,
      arbitrary: fc.dictionary(jsonKeyArbitrary, child, { maxKeys: maxWidth }),
    },
  );
}
