import {
  FTS_MATCH_OPERATOR,
  type FtsMatchOperator,
  filterOperators,
} from "../../../interfaces/filters";
import { InvalidRequestError } from "../../../errors";
import { EVENTS_TABLE_NAMES } from "../../clickhouse/schema";

export { FTS_MATCH_OPERATOR } from "../../../interfaces/filters";

type StringOperator = (typeof filterOperators)["string"][number];
export type FtsStringOperator = StringOperator | FtsMatchOperator;
export type FtsAcceleratedStringOperator = "=" | FtsMatchOperator;

export const FTS_MATCH_TOKEN_ERROR =
  "`matches` requires at least one search token.";
export const FTS_MATCH_TARGET_ERROR =
  "`matches` is only supported for input, output, and metadata filters.";

export const FTS_TEXT_NORMALIZER = "lower";
export const FTS_HAS_ALL_TOKENS_MAX_SEARCH_TOKENS = 64;

export const FTS_EVENTS_TABLES: ReadonlySet<string> = new Set(
  EVENTS_TABLE_NAMES,
);

export const FTS_TEXT_FIELDS: ReadonlySet<string> = new Set([
  "input",
  "output",
]);
export const FTS_METADATA_FIELD = "metadata";

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

const ftsSearchTokensExpr = (valueParam: string, normalize: boolean): string =>
  `arrayDistinct(tokens(${normalize ? normalizeFtsTextExpr(valueParam) : valueParam}))`;

const ftsSearchTokenPrefilterExpr = (
  valueParam: string,
  normalize: boolean,
): string =>
  `arraySlice(${ftsSearchTokensExpr(valueParam, normalize)}, 1, ${FTS_HAS_ALL_TOKENS_MAX_SEARCH_TOKENS})`;

// `hasAllTokens` can only accept up to 64 search tokens. This predicate is only
// an index prefilter; exact equality, ILIKE, or position() enforces semantics.
const ftsTokenPrefilterPredicate = (
  fieldExpr: string,
  valueParam: string,
  normalizeValue: boolean,
): string =>
  `hasAllTokens(${fieldExpr}, ${ftsSearchTokenPrefilterExpr(valueParam, normalizeValue)})`;

export const ftsTextTokenPredicate = (
  fieldExpr: string,
  valueParam: string,
): string =>
  ftsTokenPrefilterPredicate(normalizeFtsTextExpr(fieldExpr), valueParam, true);

export const ftsTextTokenConjunct = (
  fieldExpr: string,
  valueParam: string,
): string =>
  `(empty(${ftsSearchTokensExpr(valueParam, true)}) OR ${ftsTextTokenPredicate(fieldExpr, valueParam)})`;

export const ftsTextIndexedSubstringCondition = (
  fieldExpr: string,
  valueParam: string,
): string =>
  `(position(${normalizeFtsTextExpr(fieldExpr)}, ${normalizeFtsTextExpr(valueParam)}) > 0 AND ${ftsTextTokenPredicate(fieldExpr, valueParam)})`;

export const ftsMetadataArrayHas = (
  arrayExpr: string,
  valueParam: string,
): string => `has(${arrayExpr}, ${valueParam})`;

export const ftsMetadataArrayTokenConjunct = (
  arrayExpr: string,
  valueParam: string,
): string => ftsTokenPrefilterPredicate(arrayExpr, valueParam, false);

type FtsMetadataArrayConditionContext = {
  hasKey: string;
  valuesColumn: string;
  valueAccessor: string;
  valueParam: string;
};

type FtsOperatorDescriptor = {
  textCondition: (
    fieldExpr: string,
    valueParam: string,
    exactCondition: string,
  ) => string;
  metadataArrayCondition: (ctx: FtsMetadataArrayConditionContext) => string;
};

export const ftsMetadataArrayIndexedSubstringCondition = ({
  hasKey,
  valuesColumn,
  valueAccessor,
  valueParam,
}: FtsMetadataArrayConditionContext): string =>
  `${hasKey} AND ${ftsMetadataArrayTokenConjunct(valuesColumn, valueParam)} AND (position(${valueAccessor}, ${valueParam}) > 0)`;

type FtsOperatorDescriptors = {
  [operator in FtsAcceleratedStringOperator]: FtsOperatorDescriptor;
};

export const FTS_OPERATOR_DESCRIPTORS = {
  "=": {
    textCondition: (fieldExpr, valueParam, exactCondition) =>
      `(${exactCondition} AND ${ftsTextTokenConjunct(fieldExpr, valueParam)})`,
    metadataArrayCondition: ({
      hasKey,
      valuesColumn,
      valueAccessor,
      valueParam,
    }) =>
      `${hasKey} AND ${ftsMetadataArrayHas(valuesColumn, valueParam)} AND (${valueAccessor} = ${valueParam})`,
  },
  [FTS_MATCH_OPERATOR]: {
    textCondition: (fieldExpr, valueParam, _exactCondition) =>
      ftsTextIndexedSubstringCondition(fieldExpr, valueParam),
    metadataArrayCondition: ftsMetadataArrayIndexedSubstringCondition,
  },
} satisfies FtsOperatorDescriptors;

// StringFilter rewrites must preserve filter API semantics. Limit transparent
// text-index rewrites to equality because substring filters are expected to
// match inside larger tokens. `matches` is an explicit indexed literal-search
// operator.
export const FTS_TEXT_OPERATORS: ReadonlySet<FtsStringOperator> = new Set(
  Object.keys(FTS_OPERATOR_DESCRIPTORS) as FtsAcceleratedStringOperator[],
);

export const assertValidFtsMatchFilter = (opts: {
  filterType: "string" | "stringObject";
  clickhouseTable: string;
  field: string;
  value: string;
}) => {
  if (!hasFtsSearchToken(opts.value)) {
    throw new InvalidRequestError(FTS_MATCH_TOKEN_ERROR);
  }

  if (
    (opts.filterType === "string" &&
      isFtsTextTarget(opts.clickhouseTable, opts.field, FTS_MATCH_OPERATOR)) ||
    (opts.filterType === "stringObject" &&
      isFtsMetadataTarget(opts.clickhouseTable, opts.field))
  ) {
    return;
  }

  throw new InvalidRequestError(FTS_MATCH_TARGET_ERROR);
};
