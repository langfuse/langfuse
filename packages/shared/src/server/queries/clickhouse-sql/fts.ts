import {
  FTS_MATCH_OPERATOR,
  type FtsMatchOperator,
  filterOperators,
} from "../../../interfaces/filters";
import { EVENTS_TABLE_NAMES } from "../../clickhouse/schema";

export { FTS_MATCH_OPERATOR } from "../../../interfaces/filters";

type StringOperator = (typeof filterOperators)["string"][number];
export type FtsStringOperator = StringOperator | FtsMatchOperator;

export const FTS_TEXT_NORMALIZER = "lower";

export const FTS_EVENTS_TABLES: ReadonlySet<string> = new Set(
  EVENTS_TABLE_NAMES,
);

export const FTS_TEXT_FIELDS: ReadonlySet<string> = new Set([
  "input",
  "output",
]);
export const FTS_METADATA_FIELD = "metadata";

// StringFilter rewrites must preserve filter API semantics. Limit transparent
// text-index rewrites to equality because substring filters are expected to
// match inside larger tokens. `matches` is an explicit token-search operator.
export const FTS_TEXT_OPERATORS: ReadonlySet<FtsStringOperator> =
  new Set<FtsStringOperator>(["=", FTS_MATCH_OPERATOR]);

// Column mappings may carry a table prefix (e.g. "e.input"); strip to the bare
// field name before set lookup.
export const bareFtsField = (field: string): string => {
  const dot = field.lastIndexOf(".");
  if (dot === -1) return field;
  const tail = field.slice(dot + 1);
  return tail.replace(/^"(.*)"$/, "$1");
};

export const isFtsEventsTable = (
  clickhouseTable: string | undefined,
): boolean =>
  clickhouseTable !== undefined && FTS_EVENTS_TABLES.has(clickhouseTable);

export const isFtsMatchOperator = (
  operator: string | undefined,
): operator is FtsMatchOperator => operator === FTS_MATCH_OPERATOR;

export const isFtsTextField = (field: string): boolean =>
  FTS_TEXT_FIELDS.has(bareFtsField(field));

export const isFtsMetadataField = (field: string): boolean =>
  bareFtsField(field) === FTS_METADATA_FIELD;

export const isFtsTextTarget = (
  clickhouseTable: string,
  field: string,
  operator: FtsStringOperator,
): boolean =>
  isFtsEventsTable(clickhouseTable) &&
  isFtsTextField(field) &&
  FTS_TEXT_OPERATORS.has(operator);

export const isFtsMetadataTarget = (
  clickhouseTable: string,
  field: string,
): boolean => isFtsEventsTable(clickhouseTable) && isFtsMetadataField(field);

export const isFtsAcceleratedIoOperator = (operator: string): boolean =>
  FTS_TEXT_OPERATORS.has(operator as FtsStringOperator);

export const hasFtsSearchToken = (value: string): boolean =>
  /[\p{L}\p{N}]/u.test(value);

const normalizeFtsTextExpr = (expr: string): string =>
  `${FTS_TEXT_NORMALIZER}(${expr})`;

export const ftsTextTokenConjunct = (
  fieldExpr: string,
  valueParam: string,
): string =>
  `(empty(tokens(${normalizeFtsTextExpr(valueParam)})) OR hasAllTokens(${normalizeFtsTextExpr(fieldExpr)}, ${normalizeFtsTextExpr(valueParam)}))`;

export const ftsTextMatchesCondition = (
  fieldExpr: string,
  valueParam: string,
): string =>
  `hasAllTokens(${normalizeFtsTextExpr(fieldExpr)}, ${normalizeFtsTextExpr(valueParam)})`;

export const ftsMetadataArrayHas = (
  arrayExpr: string,
  valueParam: string,
): string => `has(${arrayExpr}, ${valueParam})`;

export const ftsMetadataArrayTokenConjunct = (
  arrayExpr: string,
  valueParam: string,
): string => `hasAllTokens(${arrayExpr}, ${valueParam})`;
