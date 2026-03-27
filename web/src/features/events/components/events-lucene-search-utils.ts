import {
  getEventsLuceneFieldKindById,
  getEventsLuceneSupportedFields,
  type EventsLuceneFieldId,
} from "@langfuse/shared";

export type EventsLuceneAutocompleteOptions = Partial<
  Record<EventsLuceneFieldId, string[]>
>;

type EventsLuceneAutocompleteOptionLike =
  | string
  | {
      value: string;
    };

export type EventsLuceneCompletionItem = {
  label: string;
  apply: string;
  type: "property" | "keyword" | "text" | "snippet";
  detail?: string;
  boost?: number;
  section?: EventsLuceneCompletionSection;
};

export type EventsLuceneAutocompleteResult = {
  from: number;
  items: EventsLuceneCompletionItem[];
};

export type EventsLuceneCompletionSection =
  | "Fields"
  | "Operators"
  | "Observed Values"
  | "Patterns";

type LuceneAutocompleteContext =
  | {
      kind: "value";
      field: string;
      from: number;
      query: string;
      quoted: boolean;
    }
  | {
      kind: "field";
      from: number;
      query: string;
    }
  | {
      kind: "operator";
      from: number;
      query: string;
    };

type LuceneTokenMatch = {
  length: number;
  token: string | null;
};

const FIELD_DESCRIPTIONS: Record<EventsLuceneFieldId, string> = {
  id: "Observation/span identifier",
  traceId: "Trace identifier",
  name: "Observation name",
  traceName: "Trace name",
  type: "Observation type",
  environment: "Environment",
  userId: "User identifier",
  sessionId: "Session identifier",
  level: "Observation level",
  statusMessage: "Status message",
  modelId: "Internal model identifier",
  providedModelName: "Model name",
  promptName: "Prompt name",
  promptVersion: "Prompt version",
  startTime: "Observation start time",
  endTime: "Observation end time",
  input: "Observation input",
  output: "Observation output",
};

const BOOLEAN_OPERATOR_ITEMS: EventsLuceneCompletionItem[] = [
  {
    label: "AND",
    apply: "AND ",
    type: "keyword",
    detail: "Require both clauses",
    boost: 40,
    section: "Operators",
  },
  {
    label: "OR",
    apply: "OR ",
    type: "keyword",
    detail: "Match either clause",
    boost: 39,
    section: "Operators",
  },
  {
    label: "NOT",
    apply: "NOT ",
    type: "keyword",
    detail: "Negate the next clause",
    boost: 38,
    section: "Operators",
  },
];

const BOOLEAN_GROUP_SNIPPETS: EventsLuceneCompletionItem[] = [
  {
    label: "AND (...)",
    apply: "AND (",
    type: "snippet",
    detail: "Start a nested AND group",
    boost: 37,
    section: "Patterns",
  },
  {
    label: "OR (...)",
    apply: "OR (",
    type: "snippet",
    detail: "Start a nested OR group",
    boost: 36,
    section: "Patterns",
  },
  {
    label: "NOT (...)",
    apply: "NOT (",
    type: "snippet",
    detail: "Negate a grouped clause",
    boost: 35,
    section: "Patterns",
  },
];

const TEXT_VALUE_SNIPPETS: EventsLuceneCompletionItem[] = [
  {
    label: "*",
    apply: "*",
    type: "snippet",
    detail: "Field exists",
    boost: 24,
    section: "Patterns",
  },
  {
    label: '"quoted phrase"',
    apply: '"quoted phrase"',
    type: "snippet",
    detail: "Exact phrase",
    boost: 16,
    section: "Patterns",
  },
  {
    label: "value*",
    apply: "value*",
    type: "snippet",
    detail: "Prefix match",
    boost: 14,
    section: "Patterns",
  },
];

const NUMERIC_VALUE_SNIPPETS: EventsLuceneCompletionItem[] = [
  {
    label: "3",
    apply: "3",
    type: "snippet",
    detail: "Exact numeric value",
    boost: 16,
    section: "Patterns",
  },
  {
    label: "[1 TO 10]",
    apply: "[1 TO 10]",
    type: "snippet",
    detail: "Inclusive numeric range",
    boost: 15,
    section: "Patterns",
  },
];

const DATETIME_VALUE_SNIPPETS: EventsLuceneCompletionItem[] = [
  {
    label: "[2025-01-01 TO 2025-01-31]",
    apply: "[2025-01-01 TO 2025-01-31]",
    type: "snippet",
    detail: "Inclusive date range",
    boost: 16,
    section: "Patterns",
  },
  {
    label: "[2025-01-01T00:00:00Z TO *]",
    apply: "[2025-01-01T00:00:00Z TO *]",
    type: "snippet",
    detail: "Open-ended datetime range",
    boost: 15,
    section: "Patterns",
  },
];

export function normalizeEventsLuceneAutocompleteValues(
  values: ReadonlyArray<EventsLuceneAutocompleteOptionLike> | null | undefined,
): string[] {
  if (!values) {
    return [];
  }

  return values
    .map((value) => (typeof value === "string" ? value : value.value))
    .filter((value): value is string => Boolean(value));
}

function escapeLuceneQuotedValue(value: string) {
  return value.replace(/(["\\])/g, "\\$1");
}

function formatLuceneValueInsertion(value: string, quoted: boolean) {
  const escapedValue = escapeLuceneQuotedValue(value);

  if (quoted) {
    return `${escapedValue}"`;
  }

  return /[\s()[\]{}]/.test(value) ? `"${escapedValue}"` : escapedValue;
}

function filterAndSortItems(
  items: EventsLuceneCompletionItem[],
  query: string,
  getComparisonValue: (item: EventsLuceneCompletionItem) => string = (item) =>
    item.label,
) {
  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = normalizedQuery
    ? items.filter((item) =>
        getComparisonValue(item).toLowerCase().includes(normalizedQuery),
      )
    : items;

  return filteredItems.sort((left, right) => {
    const leftValue = getComparisonValue(left).toLowerCase();
    const rightValue = getComparisonValue(right).toLowerCase();
    const leftStartsWith = normalizedQuery
      ? leftValue.startsWith(normalizedQuery)
      : false;
    const rightStartsWith = normalizedQuery
      ? rightValue.startsWith(normalizedQuery)
      : false;

    if (leftStartsWith !== rightStartsWith) {
      return leftStartsWith ? -1 : 1;
    }

    const leftBoost = left.boost ?? 0;
    const rightBoost = right.boost ?? 0;
    if (leftBoost !== rightBoost) {
      return rightBoost - leftBoost;
    }

    return left.label.localeCompare(right.label);
  });
}

function getLuceneAutocompleteContext(
  query: string,
  cursor: number,
): LuceneAutocompleteContext {
  const prefix = query.slice(0, cursor);

  const valueMatch = prefix.match(
    /(?:^|[\s(])((?:metadata\.[A-Za-z0-9_.-]*|[A-Za-z_][A-Za-z0-9_.-]*)):(?:"([^"]*)|([^\s()[\]{}]*))$/,
  );

  if (valueMatch) {
    const rawField = valueMatch[1] ?? "";
    const quotedValue = valueMatch[2];
    const unquotedValue = valueMatch[3];
    const valueQuery = quotedValue ?? unquotedValue ?? "";

    return {
      kind: "value",
      field: rawField,
      from: cursor - valueQuery.length,
      query: valueQuery,
      quoted: quotedValue !== undefined,
    };
  }

  if (/[)\s]$/.test(prefix)) {
    return {
      kind: "operator",
      from: cursor,
      query: "",
    };
  }

  const fieldMatch = prefix.match(/(?:^|[\s(])([A-Za-z_][A-Za-z0-9_.-]*)?$/);

  return {
    kind: "field",
    from: cursor - (fieldMatch?.[1]?.length ?? 0),
    query: fieldMatch?.[1] ?? "",
  };
}

export function resolveEventsLuceneCompletionItems(
  query: string,
  cursor: number,
  fieldOptions: EventsLuceneAutocompleteOptions,
): EventsLuceneAutocompleteResult {
  const context = getLuceneAutocompleteContext(query, cursor);
  const supportedFields =
    getEventsLuceneSupportedFields() as EventsLuceneFieldId[];

  if (context.kind === "value") {
    if (context.field.startsWith("metadata.")) {
      return {
        from: context.from,
        items: filterAndSortItems(
          TEXT_VALUE_SNIPPETS.map((item) => ({
            ...item,
            apply:
              item.label === '"quoted phrase"'
                ? formatLuceneValueInsertion("quoted phrase", context.quoted)
                : item.apply,
          })),
          context.query,
        ),
      };
    }

    if (!supportedFields.includes(context.field as EventsLuceneFieldId)) {
      return {
        from: context.from,
        items: [],
      };
    }

    const fieldId = context.field as EventsLuceneFieldId;
    const fieldKind = getEventsLuceneFieldKindById(fieldId);
    const optionValues =
      fieldOptions[fieldId]?.slice(0, 20).map((value) => ({
        label: value,
        apply: formatLuceneValueInsertion(value, context.quoted),
        type: "text" as const,
        detail: "Observed value",
        boost: 30,
        section: "Observed Values" as const,
      })) ?? [];

    if (fieldKind === "text") {
      return {
        from: context.from,
        items: filterAndSortItems(
          [
            ...optionValues,
            ...TEXT_VALUE_SNIPPETS.map((item) => ({
              ...item,
              apply:
                item.label === '"quoted phrase"'
                  ? formatLuceneValueInsertion("quoted phrase", context.quoted)
                  : item.apply,
            })),
          ],
          context.query,
        ),
      };
    }

    if (fieldKind === "number") {
      return {
        from: context.from,
        items: filterAndSortItems(NUMERIC_VALUE_SNIPPETS, context.query),
      };
    }

    return {
      from: context.from,
      items: filterAndSortItems(DATETIME_VALUE_SNIPPETS, context.query),
    };
  }

  const fieldItems: EventsLuceneCompletionItem[] = supportedFields.map(
    (fieldId) => ({
      label: `${fieldId}:`,
      apply: `${fieldId}:`,
      type: "property",
      detail: FIELD_DESCRIPTIONS[fieldId],
      boost: 50,
      section: "Fields",
    }),
  );

  fieldItems.push({
    label: "metadata.<key>:",
    apply: "metadata.",
    type: "property",
    detail: "Metadata field lookup",
    boost: 48,
    section: "Fields",
  });

  if (context.kind === "operator") {
    return {
      from: context.from,
      items: filterAndSortItems(
        [...BOOLEAN_OPERATOR_ITEMS, ...BOOLEAN_GROUP_SNIPPETS, ...fieldItems],
        context.query,
      ),
    };
  }

  return {
    from: context.from,
    items: filterAndSortItems(
      [...fieldItems, ...BOOLEAN_OPERATOR_ITEMS, ...BOOLEAN_GROUP_SNIPPETS],
      context.query,
      (item) => item.label.replace(/:$/, ""),
    ),
  };
}

export function matchEventsLuceneToken(segment: string): LuceneTokenMatch {
  if (segment.length === 0) {
    return {
      length: 0,
      token: null,
    };
  }

  const leadingWhitespace = segment.match(/^\s+/)?.[0];
  if (leadingWhitespace) {
    return {
      length: leadingWhitespace.length,
      token: null,
    };
  }

  const quotedValue = segment.match(/^"(?:[^"\\]|\\.)*"?/)?.[0];
  if (quotedValue) {
    return {
      length: quotedValue.length,
      token: "string",
    };
  }

  const fieldName = segment.match(
    /^(?:metadata\.[A-Za-z_][A-Za-z0-9_.-]*|[A-Za-z_][A-Za-z0-9_.-]*)(?=:)/,
  )?.[0];
  if (fieldName) {
    return {
      length: fieldName.length,
      token: "propertyName",
    };
  }

  const operator = segment.match(/^(?:AND|OR|NOT|TO)\b/)?.[0];
  if (operator) {
    return {
      length: operator.length,
      token: "keyword",
    };
  }

  const punctuation = segment.match(/^[:,[\]{}()]/)?.[0];
  if (punctuation) {
    return {
      length: punctuation.length,
      token: punctuation === ":" ? "punctuation" : "bracket",
    };
  }

  const wildcard = segment.match(/^[*?]+/)?.[0];
  if (wildcard) {
    return {
      length: wildcard.length,
      token: "keyword",
    };
  }

  const dateTime = segment.match(
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?/,
  )?.[0];
  if (dateTime) {
    return {
      length: dateTime.length,
      token: "number",
    };
  }

  const number = segment.match(/^-?\d+(?:\.\d+)?/)?.[0];
  if (number) {
    return {
      length: number.length,
      token: "number",
    };
  }

  const term = segment.match(/^[^\s:[\]{}()"]+/)?.[0];
  if (term) {
    return {
      length: term.length,
      token: "variableName",
    };
  }

  return {
    length: 1,
    token: null,
  };
}

export function tokenizeEventsLuceneQuery(query: string) {
  const tokens: Array<{ text: string; token: string | null }> = [];
  let cursor = 0;

  while (cursor < query.length) {
    const match = matchEventsLuceneToken(query.slice(cursor));
    const text = query.slice(cursor, cursor + match.length);
    tokens.push({
      text,
      token: match.token,
    });
    cursor += Math.max(match.length, 1);
  }

  return tokens;
}
