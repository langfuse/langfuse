import type { AliasableExpression } from "kysely";

import { QueryCompileError } from "../../../server/query-ast/errors";
import { nullIfEmpty } from "../../../server/query-ast/extensions";
import type { ScalarFieldLowering } from "../../../server/repositories/events-predicate-fields";

/**
 * The own entry `name` of `registry`; throws `QueryCompileError` naming
 * `kind` and `registryName` when it has none. An inherited key such as
 * `constructor` counts as none.
 */
export function entryOf<T>(
  registry: Readonly<Record<string, T>>,
  name: string,
  kind: "Dimension" | "Measure",
  registryName: string,
): T {
  const entry = Object.hasOwn(registry, name) ? registry[name] : undefined;
  if (entry === undefined) {
    throw new QueryCompileError(
      `${kind} "${name}" has no entry in ${registryName}.`,
    );
  }
  return entry;
}

/** A dimension's row value, built with the registry's builder `B`. */
export type Read<T, B> = (eb: B) => AliasableExpression<T>;

/** A non-array dimension: its value, and what a dashboard filter compares. */
export type ScalarDimensionEntry<B> = {
  /** Tells it apart from an array dimension (`array: true`). */
  array?: undefined;
  expression: Read<unknown, B>;
  filter: ScalarFieldLowering<B>;
};

/** `events_full` keeps an ngram index on `lower(<col>)` (see `ScalarFieldLowering`). */
type NgramFacts = { ngramIndexed?: true };

/**
 * Constructors of non-array dimensions over the builder `B` of one registry.
 * A registry binds them once (`scalarDimensions<ScoresBuilder>()`), since an
 * entry's `(eb) => …` gives no `B` to infer.
 */
export const scalarDimensions = <B>() => ({
  /** A `String` dimension, filtered as it is; `null` conditions read `''` as missing. */
  stringDimension: (
    value: Read<string, B>,
    facts: NgramFacts = {},
  ): ScalarDimensionEntry<B> => ({
    expression: value,
    filter: { kind: "string", value, ...facts },
  }),
  /** `nullIf(column, '')`, filtered on `column` with `''` and NULL as one value. */
  nullIfEmptyDimension: (
    column: Read<string, B>,
    facts: NgramFacts = {},
  ): ScalarDimensionEntry<B> => ({
    expression: (eb) => nullIfEmpty(column(eb)),
    filter: { kind: "string", value: column, emptyEqualsNull: true, ...facts },
  }),
  /** A `Nullable(String)` dimension; `null` conditions compare it with NULL. */
  nullableStringDimension: (
    value: Read<string | null, B>,
  ): ScalarDimensionEntry<B> => ({
    expression: value,
    filter: { kind: "nullableString", value },
  }),
  /** A number or boolean dimension, filtered as it is. */
  scalarDimension: (value: Read<unknown, B>): ScalarDimensionEntry<B> => ({
    expression: value,
    filter: { kind: "scalar", value },
  }),
});

/** Level of a dashboard query: `two` has an inner aggregating select. */
export type QueryLevel = "single" | "two";
