// Operator select of a key/value row (metadata) that compares its values as
// text or as numbers. Both kinds share one select, so numeric option values
// carry a prefix (`number:>`): a numeric `=` must not read as the text `=`.
const NUMERIC_OPTION_PREFIX = "number:";

type OperatorOption<T extends string> = { value: T; label: string };

/**
 * The text options, then the numeric ones. The numeric `=` is offered only
 * when `keepNumericEquals` (the row already is one, e.g. from a URL or the
 * API): unquoted values cannot tell `2` from `"2"`, so text equality is the
 * equality offered.
 */
export const textAndNumericOperatorOptions = <T extends string>(
  textOptions: readonly OperatorOption<T>[],
  numericOptions: readonly OperatorOption<string>[],
  keepNumericEquals: boolean,
): OperatorOption<string>[] => [
  ...textOptions,
  ...numericOptions
    .filter((option) => option.value !== "=" || keepNumericEquals)
    .map((option) => ({
      value: `${NUMERIC_OPTION_PREFIX}${option.value}`,
      label: option.value === "=" ? `${option.label} (number)` : option.label,
    })),
];

/** The select value of a row's operator, `number:>` on a numeric row. */
export const operatorSelectValue = (
  numeric: boolean,
  operator: string,
): string => (numeric ? `${NUMERIC_OPTION_PREFIX}${operator}` : operator);

/** The operator a select value names and whether it is numeric. */
export const parseOperatorSelectValue = (
  value: string,
): { numeric: boolean; operator: string } =>
  value.startsWith(NUMERIC_OPTION_PREFIX)
    ? { numeric: true, operator: value.slice(NUMERIC_OPTION_PREFIX.length) }
    : { numeric: false, operator: value };
