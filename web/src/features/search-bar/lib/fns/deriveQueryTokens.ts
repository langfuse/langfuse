import { type ComponentProps } from "react";
import { type QueryTokens } from "@/src/components/design-system/QueryTokens/QueryTokens";
import { QUERY_LABEL_COLORS } from "@/src/components/design-system/QueryTokens/QueryTokens.constants";
import { type ScoreTypeContext } from "../adapter";
import { deriveComposerSegments } from "../composer-segments";
import { type FieldRegistry } from "../fields";
import { indexOfOutsideQuotes } from "../langQ";
import { explainSegment } from "../explain";
import { deactivationReason } from "../../components/presentation";

export function deriveQueryTokens({
  draft,
  scoreTypes,
  registry,
  showDiagnostics,
  fieldReason,
  freeTextReason,
}: {
  draft: string;
  scoreTypes: ScoreTypeContext | undefined;
  registry: FieldRegistry;
  showDiagnostics: boolean;
  fieldReason: ((field: string) => string | null) | undefined;
  freeTextReason: string | null | undefined;
}): ComponentProps<typeof QueryTokens>["tokens"] {
  return deriveComposerSegments(draft, scoreTypes, registry).map((segment) => {
    const token = {
      id: segment.id,
      from: segment.from,
      to: segment.to,
      raw: segment.raw,
      editable: segment.editable,
      kind:
        segment.kind === "invalid" && !showDiagnostics
          ? ("freeText" as const)
          : segment.kind,
      error: segment.kind === "invalid" ? segment.message : null,
      explanation: explainSegment(segment, registry, draft),
      inactiveReason: deactivationReason(segment, fieldReason, freeTextReason),
    };
    if (segment.kind !== "filter") return token;
    const raw = segment.target
      ? segment.raw.slice(0, segment.target.from) +
        segment.raw.slice(segment.target.to)
      : segment.raw;
    const dash = segment.negated ? "-" : "";
    const prefixTarget =
      segment.target !== undefined && segment.target.from <= dash.length;
    const targetParts = segment.target
      ? [
          {
            text: segment.raw.slice(segment.target.from, segment.target.to),
            tone: "target" as const,
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
      ...token,
      groups: [
        {
          noWrap: true,
          parts: [
            { text: dash, tone: "muted" as const },
            ...(prefixTarget ? targetParts : []),
            { text: segment.displayField, tone: "field" as const },
            { text: ":", tone: "muted" as const },
          ],
        },
        {
          noWrap: false,
          parts: [
            {
              text: colon === -1 ? "" : body.slice(colon + 1),
              tone: numeric ? ("number" as const) : ("value" as const),
            },
            ...(!prefixTarget ? targetParts : []),
          ],
        },
      ],
    };
  });
}
