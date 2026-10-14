/**
 * Helpers for working with Stripe's `expand` feature using correct TypeScript types.
 *
 * Stripe often returns fields as `string | T` via `Expandable<T>`. When you
 * request expansions (e.g. `{ expand: ["default_price"] }`), the SDK still
 * types those fields as `string | T`. These utilities assert at runtime that
 * the expansion occurred and narrow the types accordingly, so downstream code
 * can rely on fully-expanded objects without repetitive checks.
 *
 */

/**
 * Utility mapped type: take a type `T` and mark keys `K` as expanded.
 */
export type Expanded<T, K extends keyof T> = T & {
  [P in K]-?: Exclude<T[P], string | null | undefined>;
};

/**
 * Type guard that narrows a Stripe expandable field from `string | T | null | undefined`
 * to the fully expanded object `T`. Returns true when the value is non-nullish and
 * not a string (i.e., Stripe returned the expanded object).
 */
export const isExpanded = <T>(v: string | T | null | undefined): v is T =>
  v != null && typeof v !== "string";

/**
 * Utility mapped type: take a type `T` and mark keys `K` as expanded and nullable.
 */
export type ExpandedNullable<T, K extends keyof T> = {
  [P in keyof T]: P extends K ? Exclude<T[P], string> : T[P];
};
/**
 * Type guard that narrows a Stripe expandable field from `string | T | null | undefined`
 * to the fully expanded object `T` or `null | undefined`. Returns true when the value
 * is non-nullish and not a string (i.e., Stripe returned the expanded object).
 */
export const isExpandedOrNullable = <T>(
  v: string | T | null | undefined,
): v is T | null | undefined => typeof v !== "string";
