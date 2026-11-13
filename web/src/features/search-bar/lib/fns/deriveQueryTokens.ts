import { type ComponentProps } from "react";
import { type QueryTokens } from "@/src/components/design-system/QueryTokens/QueryTokens";
import { QUERY_LABEL_COLORS } from "@/src/components/design-system/QueryTokens/QueryTokens.constants";
import { type ScoreTypeContext } from "../adapter";
import {
  deriveComposerSegments,
  type ComposerSegment,
  type FilterSegment,
} from "../composer-segments";
import { type FieldRegistry } from "../fields";
import { indexOfOutsideQuotes } from "../langQ";
import { explainSegment } from "../explain";
import { deactivationReason } from "../../components/presentation";

type QueryToken = ComponentProps<typeof QueryTokens>["tokens"][number];
type TokenGroup = NonNullable<QueryToken["groups"]>[number];
type TokenPart = TokenGroup["parts"][number];
type FilterPresentation = Omit<FilterSegment, "kind">;
type FilterLayout = {
  fieldGroup: TokenGroup;
  valueGroup: TokenGroup;
  targetParts: TokenPart[];
  prefixTarget: boolean;
};
type ProjectionOptions = {
  draft: string;
  scoreTypes: ScoreTypeContext | undefined;
  registry: FieldRegistry;
  showDiagnostics: boolean;
  fieldReason: ((field: string) => string | null) | undefined;
  freeTextReason: string | null | undefined;
};

export function deriveQueryTokens(options: ProjectionOptions) {
  const { draft, scoreTypes, registry } = options;
  return deriveComposerSegments(draft, scoreTypes, registry).map((source) => {
    const token = baseTokenOf(source, options);
    const filter = filterSegmentOf(source);
    if (filter === undefined) return token;
    const layout = filterLayoutOf(filter);
    const subject = token.explanation?.subject ?? filter.displayField;
    const summary = collectionSummary(filter, subject, layout);
    return {
      ...token,
      groups: [layout.fieldGroup, layout.valueGroup],
      ...(summary ? { summary } : {}),
    };
  });
}

function baseTokenOf(
  source: ComposerSegment,
  options: ProjectionOptions,
): QueryToken {
  return {
    id: source.id,
    from: source.from,
    to: source.to,
    raw: source.raw,
    editable: source.editable,
    kind:
      source.kind === "invalid" && !options.showDiagnostics
        ? "freeText"
        : source.kind,
    error: source.kind === "invalid" ? source.message : null,
    explanation: explainSegment(source, options.registry, options.draft),
    inactiveReason: deactivationReason(
      source,
      options.fieldReason,
      options.freeTextReason,
    ),
  };
}

function filterSegmentOf(
  source: ComposerSegment,
): FilterPresentation | undefined {
  if (source.kind === "filter") return source;
  if (source.kind === "invalid" && source.filter)
    return { ...source, ...source.filter };
  return undefined;
}

function filterLayoutOf(segment: FilterPresentation): FilterLayout {
  const raw = segment.target
    ? segment.raw.slice(0, segment.target.from) +
      segment.raw.slice(segment.target.to)
    : segment.raw;
  const dash = segment.negated ? "-" : "";
  const prefixTarget =
    segment.target !== undefined && segment.target.from <= dash.length;
  const targetParts: TokenPart[] = segment.target
    ? [
        {
          text: segment.raw.slice(segment.target.from, segment.target.to),
          tone: "target",
          color: (
            Object.keys(
              QUERY_LABEL_COLORS,
            ) as (keyof typeof QUERY_LABEL_COLORS)[]
          ).find((color) =>
            segment.target?.textClassName?.includes(`text-${color}-`),
          ),
        },
      ]
    : [];
  const body = segment.negated ? raw.slice(1) : raw;
  // A quoted metadata key may contain a colon that is not the separator.
  const colon = indexOfOutsideQuotes(body, ":");
  const numeric =
    segment.values.length > 0 &&
    segment.values.every((value) => /^-?\d+(\.\d+)?$/.test(value.trim()));
  return {
    prefixTarget,
    targetParts,
    fieldGroup: {
      noWrap: true,
      parts: [
        { text: dash, tone: "muted" },
        ...(prefixTarget ? targetParts : []),
        { text: segment.displayField, tone: "field" },
        { text: ":", tone: "muted" },
      ],
    },
    valueGroup: {
      noWrap: false,
      parts: [
        {
          text: colon === -1 ? "" : body.slice(colon + 1),
          tone: numeric ? "number" : "value",
        },
        ...(!prefixTarget ? targetParts : []),
      ],
    },
  };
}

function collectionSummary(
  segment: FilterPresentation,
  subject: string,
  layout: FilterLayout,
): QueryToken["summary"] {
  if (segment.values.length <= 2 || segment.collectionEditable === false)
    return undefined;
  let relation = "any of";
  if (segment.negated !== (segment.inheritedNegation ?? false))
    relation = "none of";
  else if (segment.valueOp === "and") relation = "all of";
  const from = indexOfOutsideQuotes(segment.raw, ":") + 1;
  let to =
    segment.target && !layout.prefixTarget
      ? segment.target.from
      : segment.raw.length;
  while (to > from && /\s/.test(segment.raw[to - 1]!)) to--;
  const valueParts: TokenPart[] = [];
  if (relation !== "any of" && !segment.inheritedNegation)
    valueParts.push({
      text: `${relation === "all of" ? "all" : "none"} `,
      tone: "muted",
    });
  valueParts.push({ text: segment.values[0]!, tone: "value" });
  const groups: TokenGroup[] = [
    layout.fieldGroup,
    { noWrap: true, parts: valueParts },
  ];
  if (!layout.prefixTarget && segment.target)
    groups.push({
      noWrap: true,
      parts: [
        { text: segment.raw.slice(to, segment.target.from), tone: "muted" },
        ...layout.targetParts,
      ],
    });
  return {
    atom: {
      from: segment.from + from,
      to: segment.from + to,
      raw: segment.raw.slice(from, to),
    },
    label: `${subject} ${relation} ${segment.values.length} values`,
    previewLabel: `${subject} ${relation === "any of" ? "" : `${relation} `}${segment.values.length} values`,
    values: segment.values,
    groups,
  };
}
