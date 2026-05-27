import { filterOperators } from "../../../interfaces/filters";
import { EVENTS_TABLE_NAMES } from "../../clickhouse/schema";

type StringOperator = (typeof filterOperators)["string"][number];

export const FTS_TEXT_NORMALIZER = "lower";

export const FTS_EVENTS_TABLES: ReadonlySet<string> = new Set(
  EVENTS_TABLE_NAMES,
);

export const FTS_TEXT_FIELDS: ReadonlySet<string> = new Set([
  "input",
  "output",
]);

// StringFilter rewrites must preserve filter API semantics. Limit transparent
// text-index rewrites to equality because substring filters are expected to
// match inside larger tokens.
export const FTS_TEXT_OPERATORS: ReadonlySet<StringOperator> =
  new Set<StringOperator>(["="]);

// Column mappings may carry a table prefix (e.g. "e.input"); strip to the bare
// field name before set lookup.
const bareField = (field: string): string => {
  const dot = field.lastIndexOf(".");
  if (dot === -1) return field;
  const tail = field.slice(dot + 1);
  return tail.replace(/^"(.*)"$/, "$1");
};

export const isFtsEventsTable = (
  clickhouseTable: string | undefined,
): boolean =>
  clickhouseTable !== undefined && FTS_EVENTS_TABLES.has(clickhouseTable);

export const isFtsTextTarget = (
  clickhouseTable: string,
  field: string,
  operator: StringOperator,
): boolean =>
  isFtsEventsTable(clickhouseTable) &&
  FTS_TEXT_FIELDS.has(bareField(field)) &&
  FTS_TEXT_OPERATORS.has(operator);

const normalizeFtsTextExpr = (expr: string): string =>
  `${FTS_TEXT_NORMALIZER}(${expr})`;

export const ftsTextTokenConjunct = (
  fieldExpr: string,
  valueParam: string,
): string =>
  `(empty(tokens(${normalizeFtsTextExpr(valueParam)})) OR hasAllTokens(${normalizeFtsTextExpr(fieldExpr)}, ${normalizeFtsTextExpr(valueParam)}))`;

export const ftsMetadataArrayHas = (
  arrayExpr: string,
  valueParam: string,
): string => `has(${arrayExpr}, ${valueParam})`;
