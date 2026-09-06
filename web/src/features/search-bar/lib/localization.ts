import type { CompletionOption } from "./completions";
import type { Diagnostic } from "./langQ";
import type { TokenExplanation } from "./explain";

export type SearchBarTranslationValues = Record<string, string | number>;
export type SearchBarTranslator = (
  key: string,
  values?: SearchBarTranslationValues,
) => string;

const exactDiagnosticKeys: Record<string, string> = {
  'Unclosed "("': "diagnostics.unclosedParenthesis",
  "Unclosed quote": "diagnostics.unclosedQuote",
  "Empty value in comma list": "diagnostics.emptyCommaValue",
  "Nested groups are not supported inside grouped values":
    "diagnostics.nestedGroupsUnsupported",
  "Cannot mix AND and OR inside one value group":
    "diagnostics.mixedGroupOperators",
  "Expected uppercase OR (any of) or AND (all of) between grouped values":
    "diagnostics.expectedGroupOperator",
  "Empty grouped value": "diagnostics.emptyGroupedValue",
  "Separate grouped values with uppercase OR or AND, not commas":
    "diagnostics.groupCommaUnsupported",
  "Dangling OR — expected an expression after it": "diagnostics.danglingOr",
  "OR is missing a left-hand expression": "diagnostics.missingOrLeft",
  "AND is missing a left-hand expression": "diagnostics.missingAndLeft",
  "Dangling AND — expected an expression after it": "diagnostics.danglingAnd",
  'Unmatched ")"': "diagnostics.unmatchedParenthesis",
  'Empty group "()"': "diagnostics.emptyGroup",
  "Dangling NOT — expected an expression after it": "diagnostics.danglingNot",
  "Negation (-) only applies to field filters, e.g. -env:dev":
    "diagnostics.negationFieldOnly",
  "Unexpected input": "diagnostics.unexpectedInput",
  "Free-text search is not supported by this view":
    "diagnostics.freeTextUnsupported",
  "Negated groups are not supported — negate individual filters instead (e.g. -env:dev)":
    "diagnostics.negatedGroupsUnsupported",
  "OR is not supported yet, filters combine with AND. Use field:(a OR b) for any-of values":
    "diagnostics.orUnsupported",
  "has: accepts a single field — combine multiple has: filters with AND instead":
    "diagnostics.hasSingleField",
};

const match = (message: string, pattern: RegExp) => message.match(pattern);

function localizeOperatorLabel(
  operator: string,
  t: SearchBarTranslator,
): string {
  const keys: Record<string, string> = {
    "contains (*term*)": "operators.contains",
    "starts-with (term*)": "operators.startsWith",
    "ends-with (*term)": "operators.endsWith",
    "exact match (=)": "operators.exact",
  };
  const key = keys[operator];
  return key ? t(key) : operator;
}

function localizeScoreType(type: string, t: SearchBarTranslator): string {
  const keys: Record<string, string> = {
    numeric: "types.numeric",
    boolean: "types.boolean",
    categorical: "types.categorical",
  };
  const key = keys[type];
  return key ? t(key) : type;
}

function localizeSingleValueReason(
  reason: string,
  t: SearchBarTranslator,
): string {
  const keys: Record<string, string> = {
    "any-of number lists are not supported": "reasons.numberListsUnsupported",
    "grouped boolean values are not supported":
      "reasons.booleanGroupsUnsupported",
  };
  const key = keys[reason];
  return key ? t(key) : reason;
}

export function localizeDiagnostic(
  diagnostic: Diagnostic,
  t: SearchBarTranslator,
): Diagnostic {
  const message = diagnostic.message;
  const exactKey = exactDiagnosticKeys[message];
  if (exactKey) return { ...diagnostic, message: t(exactKey) };

  let m: RegExpMatchArray | null;
  if (
    (m = match(
      message,
      /^"(.+)" is not supported yet — use -field:value to exclude \(e\.g\. -env:dev\)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.reservedNegationToken", { token: m[1]! }),
    };
  if (
    (m = match(
      message,
      /^"(.+)" between filters is not supported yet — combine one field's values with field:\(A OR B\), or quote "(.+)" to search text$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.reservedFilterOperator", { token: m[1]! }),
    };
  if ((m = match(message, /^Unknown field "(.+)"$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.unknownField", { field: m[1]! }),
    };
  if ((m = match(message, /^Missing value after "(.+)"$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.missingValueAfter", { expression: m[1]! }),
    };
  if ((m = match(message, /^Missing grouped value after "(.+)"$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.missingGroupedValue", { expression: m[1]! }),
    };
  if ((m = match(message, /^Missing value in "(.+)"$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.missingValueIn", { expression: m[1]! }),
    };
  if ((m = match(message, /^(AND|OR) is missing a left-hand value$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.missingLeftValue", { operator: m[1]! }),
    };
  if (
    (m = match(
      message,
      /^Dangling (AND|OR) — expected a grouped value after it$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.danglingGroupOperator", { operator: m[1]! }),
    };
  if (
    (m = match(
      message,
      /^"(.+)" always has a value — this filter matches (nothing|everything)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t(
        m[2] === "nothing"
          ? "diagnostics.alwaysPresentMatchesNothing"
          : "diagnostics.alwaysPresentMatchesEverything",
        { field: m[1]! },
      ),
    };
  if (
    (m = match(
      message,
      /^Incomplete filter "(.+)" — add a value \(e\.g\. (.+)\) or quote "(.+)" to search as text$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.incompleteFilter", {
        field: m[1]!,
        example: m[2]!,
      }),
    };
  if ((m = match(message, /^"(.+)" is not a valid (.+)$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.invalidFieldValue", {
        value: m[1]!,
        field: m[2]!,
      }),
    };
  if ((m = match(message, /^Query is too long \((\d+) chars, max (\d+)\)$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.queryTooLong", {
        count: Number(m[1]),
        max: Number(m[2]),
      }),
    };
  if (
    (m = match(
      message,
      /^Free text "(.+)" cannot be negated — search text is global$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.freeTextCannotBeNegated", { value: m[1]! }),
    };
  if (
    (m = match(
      message,
      /^Incomplete field "(.+)" — add a key after the dot \(e\.g\. (.+)\)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.incompleteField", {
        field: m[1]!,
        example: m[2]!,
      }),
    };
  if (
    (m = match(
      message,
      /^"(.+)" supports a single \*value\* — multiple contains terms cannot be combined with OR in the filter contract$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.singleContains", { field: m[1]! }),
    };
  if ((m = match(message, /^"(.+)" supports a single (.+)$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.singleForm", { field: m[1]!, form: m[2]! }),
    };
  if ((m = match(message, /^"(.+)" contains an unknown option$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.unknownOption", { field: m[1]! }),
    };
  if ((m = match(message, /^"(.+)" expects a number, got "(.*)"$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.expectedNumber", { field: m[1]!, value: m[2]! }),
    };
  if (
    (m = match(
      message,
      /^"(.+)" expects a single value — any-of number lists are not supported$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.singleNumber", { field: m[1]! }),
    };
  if ((m = match(message, /^"(.+)" does not support (.+)$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.unsupportedOperator", {
        field: m[1]!,
        operator: m[2]!,
      }),
    };
  if (
    (m = match(
      message,
      /^"(.+)" is a datetime field — use a comparison \(e\.g\. (.+)\)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.datetimeComparison", {
        field: m[1]!,
        example: m[2]!,
      }),
    };
  if ((m = match(message, /^"(.+)" expects an ISO date, got "(.+)"$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.expectedIsoDate", { field: m[1]!, value: m[2]! }),
    };
  if ((m = match(message, /^"(.+)" expects exactly one of true\/false$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.singleBoolean", { field: m[1]! }),
    };
  if ((m = match(message, /^"(.+)" expects true or false, got "(.+)"$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.expectedBoolean", { field: m[1]!, value: m[2]! }),
    };
  if ((m = match(message, /^has: expects a field name, got "(.+)"$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.hasExpectedField", { value: m[1]! }),
    };

  if (
    (m = match(
      message,
      /^AND grouping \(all of\) only applies to array fields like traceTags — "(.+)" is not an array$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.andGroupingArrayOnly", { field: m[1]! }),
    };
  if (
    (m = match(
      message,
      /^AND grouping only works with plain values, not (.+)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.andGroupingPlainValues", {
        operator: localizeOperatorLabel(m[1]!, t),
      }),
    };
  if (
    (m = match(
      message,
      /^has: lists fields that have a value — it does not support (.+)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.hasOperatorUnsupported", {
        operator: localizeOperatorLabel(m[1]!, t),
      }),
    };
  if (
    (m = match(
      message,
      /^metadata filters match text — (.+) comparisons are not supported$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.metadataComparisonUnsupported", {
        operator: m[1]!,
      }),
    };
  if (
    (m = match(
      message,
      /^score filters compare numbers \((.+):>0\.8\) or match categories \((.+):positive\) — (.+) is not supported$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.scoreOperatorUnsupported", {
        numericExample: `${m[1]!}:>0.8`,
        categoryExample: `${m[2]!}:positive`,
        operator: localizeOperatorLabel(m[3]!, t),
      }),
    };
  if (
    (m = match(
      message,
      /^"(.+)" only supports presence checks \(has:(.+) or -has:(.+)\)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.presenceChecksOnly", { field: m[1]! }),
    };
  if (
    (m = match(
      message,
      /^"(.+)" maps labeled options to exact stored values and does not support (.+)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.labeledOptionsExactOnly", {
        field: m[1]!,
        operator: localizeOperatorLabel(m[2]!, t),
      }),
    };
  if (
    (m = match(
      message,
      /^"(.+)" is a (number|datetime|boolean|text) field and does not support (.+)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.fieldTypeOperatorUnsupported", {
        field: m[1]!,
        type: t(`types.${m[2]}`),
        operator: localizeOperatorLabel(m[3]!, t),
      }),
    };
  if (
    (m = match(
      message,
      /^"(.+)" is an array field — use values \((.+)\), any-of groups \((.+)\), or all-of groups \((.+)\)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.arrayFieldOperators", {
        field: m[1]!,
        valueExample: m[2]!,
        anyExample: m[3]!,
        allExample: m[4]!,
      }),
    };
  if (
    (m = match(
      message,
      /^negated all-of groups on "(.+)" are not representable — negate single values instead$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.negatedAllOfUnsupported", { field: m[1]! }),
    };
  if (
    (m = match(
      message,
      /^negation of (.+) is not representable in the Langfuse filter contract$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.negatedOperatorUnsupported", {
        operator: localizeOperatorLabel(m[1]!, t),
      }),
    };
  if (
    (m = match(
      message,
      /^negated exact match on metadata is not representable — use -(.+):\*value\* \(does not contain\)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.negatedMetadataExactUnsupported", {
        example: `-${m[1]!}:*value*`,
      }),
    };
  if (
    (m = match(
      message,
      /^negated equality on metadata is not representable — use -(.+):\*value\* \(does not contain\)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.negatedMetadataEqualityUnsupported", {
        example: `-${m[1]!}:*value*`,
      }),
    };
  if (
    (m = match(
      message,
      /^negated equality on "(.+)" is not representable — use comparisons \((.+):<n or (.+):>n\)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.negatedNumberEqualityUnsupported", {
        lowerExample: `${m[2]!}:<n`,
        upperExample: `${m[3]!}:>n`,
      }),
    };
  if (
    (m = match(
      message,
      /^metadata\.(.+) supports a single value — any-of metadata groups are not supported$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.singleMetadataValue", {
        path: `metadata.${m[1]!}`,
      }),
    };
  if (
    (m = match(
      message,
      /^negated numeric score equality is not representable — use comparisons \((.+):<n or (.+):>n\)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.negatedNumericScoreEqualityUnsupported", {
        lowerExample: `${m[1]!}:<n`,
        upperExample: `${m[2]!}:>n`,
      }),
    };

  // Operator-compatibility and score-path errors share the same stable suffixes.
  if ((m = match(message, /^(.+) is boolean — use true or false$/)))
    return {
      ...diagnostic,
      message: t("diagnostics.booleanScoreValue", { path: m[1]! }),
    };
  if (
    (m = match(
      message,
      /^(.+) is (boolean|categorical) — comparison operators only apply to numeric scores$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.scoreComparison", {
        path: m[1]!,
        type: localizeScoreType(m[2]!, t),
      }),
    };
  if (
    (m = match(
      message,
      /^(.+) expects a single numeric value — any-of number lists are not supported$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.singleNumericScoreValue", { path: m[1]! }),
    };
  if (
    (m = match(
      message,
      /^(.+) expects a single boolean value — grouped boolean values are not supported$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.singleBooleanScoreValue", { path: m[1]! }),
    };
  if (
    (m = match(
      message,
      /^(.+) expects a single (numeric|boolean) value — (.+)$/,
    ))
  )
    return {
      ...diagnostic,
      message: t("diagnostics.singleTypedValue", {
        path: m[1]!,
        type: localizeScoreType(m[2]!, t),
        reason: localizeSingleValueReason(m[3]!, t),
      }),
    };

  return diagnostic;
}

const sectionKeys: Record<string, string> = {
  Suggestions: "sections.suggestions",
  Fields: "sections.fields",
  "Matching filters": "sections.matchingFilters",
  "Observed values": "sections.observedValues",
  Operators: "sections.operators",
  Patterns: "sections.patterns",
  "Recent searches": "sections.recentSearches",
  "Match operators": "sections.matchOperators",
  Comparisons: "sections.comparisons",
  "Observed keys": "sections.observedKeys",
  "Score names": "sections.scoreNames",
  "Full-text search": "sections.fullTextSearch",
};

export function localizeCompletionSection(
  title: string,
  t: SearchBarTranslator,
) {
  const key = sectionKeys[title];
  return key ? t(key) : title;
}

export function localizeCompletionDetail(
  option: CompletionOption,
  t: SearchBarTranslator,
): string | undefined {
  if (!("detail" in option) || option.detail === undefined) return undefined;
  const detail = option.detail;
  const exact: Record<string, string> = {
    contains: "details.contains",
    "any of": "details.anyOf",
    "negation (none of)": "details.negation",
    "numeric comparison (seconds)": "details.numericComparison",
    "field has a value (-has: for missing)": "details.fieldPresence",
    "array all-of": "details.arrayAllOf",
    "metadata key path, e.g. metadata.region:eu": "details.metadataPath",
    "score by name, e.g. scores.accuracy:>0.8 or scores.feedback:positive":
      "details.scorePath",
    "contains (same as the bare value)": "details.containsBare",
    "exact (does not equal)": "details.exactNotEqual",
    "exact match": "details.exactMatch",
    "starts with": "details.startsWith",
    "ends with": "details.endsWith",
    "search only the input payload": "details.inputOnly",
    "search only the output payload": "details.outputOnly",
    "default: ids, names, input & output": "details.defaultScope",
    "numeric score": "details.numericScore",
    "categorical score": "details.categoricalScore",
    "boolean score": "details.booleanScore",
    "numeric + categorical score": "details.numericCategoricalScore",
  };
  const exactKey = exact[detail];
  if (exactKey) return t(exactKey);
  const scoreTypeKeys: Record<string, string> = {
    "numeric score + boolean score": "details.numericBooleanScore",
    "categorical score + boolean score": "details.categoricalBooleanScore",
    "numeric + categorical score + boolean score": "details.allScoreTypes",
  };
  const scoreTypeKey = scoreTypeKeys[detail];
  if (scoreTypeKey) return t(scoreTypeKey);
  const dataTypeKeys: Record<string, string> = {
    string: "details.dataTypes.string",
    number: "details.dataTypes.number",
    boolean: "details.dataTypes.boolean",
    object: "details.dataTypes.object",
    array: "details.dataTypes.array",
    null: "details.dataTypes.null",
  };
  const dataTypeKey = dataTypeKeys[detail];
  if (dataTypeKey) return t(dataTypeKey);
  const presence = detail.match(
    /^field has a value, e\.g\. (.+) \(-has: for missing\)$/,
  );
  if (presence)
    return t("details.fieldPresenceExample", { example: presence[1]! });
  const comparison = detail.match(
    /^(greater than|at least|less than|at most) — e\.g\. (.+)$/,
  );
  if (comparison)
    return t(`details.comparison.${comparison[1]!.replaceAll(" ", "")}`, {
      example: comparison[2]!,
    });
  const defaultContains = detail.match(/^(.+) contains "(.+)"$/);
  if (defaultContains)
    return t("details.fieldContains", {
      field: defaultContains[1]!,
      value: defaultContains[2]!,
    });
  return detail;
}

export function localizeTokenExplanation(
  explanation: TokenExplanation,
  t: SearchBarTranslator,
): TokenExplanation {
  let subject = explanation.subject;
  let predicate = explanation.predicate;

  const metadata = subject.match(/^Metadata (.+)$/);
  const traceScore = subject.match(/^Trace score (.+)$/);
  const score = subject.match(/^Score (.+)$/);
  if (metadata) subject = t("explanations.metadata", { key: metadata[1]! });
  else if (traceScore)
    subject = t("explanations.traceScore", { key: traceScore[1]! });
  else if (score) subject = t("explanations.score", { key: score[1]! });
  else if (subject === "Full-text search")
    subject = t("explanations.fullTextSearch");
  else if (predicate === "" && subject.endsWith(".")) {
    subject = t("explanations.statement", { value: subject.slice(0, -1) });
  } else {
    subject = subject.replaceAll(" and ", t("explanations.andJoin"));
  }

  const exactPredicates: Record<string, string> = {
    "— every filter has to match.": "explanations.keywordAnd",
    "— either side can match.": "explanations.keywordOr",
    "— excludes the filter that follows.": "explanations.keywordNot",
    "is set.": "explanations.isSet",
    "are set.": "explanations.areSet",
    "is not set.": "explanations.isNotSet",
    "are not set.": "explanations.areNotSet",
  };
  const exactKey = exactPredicates[predicate];
  if (exactKey) return { subject, predicate: t(exactKey) };

  const localizeValue = (value: string) => {
    const duration = value.match(/^(.+) (second|seconds)$/);
    const localizedDuration = duration
      ? t(
          duration[2] === "second"
            ? "explanations.second"
            : "explanations.seconds",
          { value: duration[1]! },
        )
      : value;
    return localizedDuration
      .replaceAll(" or ", t("explanations.orJoin"))
      .replaceAll(" and ", t("explanations.andJoin"));
  };

  const patterns: Array<[RegExp, string, string]> = [
    [/^is after (.+)\.$/, "explanations.isAfter", "value"],
    [/^is on or after (.+)\.$/, "explanations.isOnOrAfter", "value"],
    [/^is before (.+)\.$/, "explanations.isBefore", "value"],
    [/^is on or before (.+)\.$/, "explanations.isOnOrBefore", "value"],
    [/^is above (.+)\.$/, "explanations.isAbove", "value"],
    [/^is (.+) or more\.$/, "explanations.isAtLeast", "value"],
    [/^is below (.+)\.$/, "explanations.isBelow", "value"],
    [/^is (.+) or less\.$/, "explanations.isAtMost", "value"],
    [/^is not exactly (.+)\.$/, "explanations.isNotExactly", "values"],
    [/^is exactly (.+)\.$/, "explanations.isExactly", "values"],
    [/^is none of (.+)\.$/, "explanations.isNoneOf", "values"],
    [/^is not (.+)\.$/, "explanations.isNot", "value"],
    [/^is (.+)\.$/, "explanations.is", "values"],
    [/^include all of (.+)\.$/, "explanations.includesAll", "values"],
    [/^include none of (.+)\.$/, "explanations.includesNone", "values"],
    [/^do not include (.+)\.$/, "explanations.doesNotInclude", "value"],
    [/^include (.+)\.$/, "explanations.includes", "values"],
    [/^does not contain (.+)\.$/, "explanations.doesNotContain", "values"],
    [/^contains (.+)\.$/, "explanations.contains", "values"],
    [/^starts with (.+)\.$/, "explanations.startsWith", "value"],
    [/^ends with (.+)\.$/, "explanations.endsWith", "value"],
  ];
  for (const [pattern, key, valueKey] of patterns) {
    const result = predicate.match(pattern);
    if (result) {
      predicate = t(key, { [valueKey]: localizeValue(result[1]!) });
      return { subject, predicate };
    }
  }
  const fullText = predicate.match(
    /^for (.+) — matches id, name, input and output\.$/,
  );
  if (fullText)
    predicate = t("explanations.fullTextPredicate", { value: fullText[1]! });

  return { subject, predicate };
}
