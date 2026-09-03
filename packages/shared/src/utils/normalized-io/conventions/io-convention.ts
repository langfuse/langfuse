import type {
  FinishReason,
  NormalizedMessage,
  NormalizedMessagePart,
  NormalizedMessageRole,
  ToolDefinition,
} from "../types";

/** Exclusive-hook result. `try*` hooks are exclusive: the first provider
 * that returns `matched: true` wins. `value: null` = recognized but
 * intentionally omitted (dropped). */
export type ConventionResult<T> =
  | { matched: false }
  | { matched: true; value: T | null };

export const unmatched = { matched: false } as const;
export const claimed = <T>(value: T | null): ConventionResult<T> => ({
  matched: true,
  value,
});
export const dropped = { matched: true, value: null } as const;

export type PartHandlerContext = {
  normalizePart(value: unknown): NormalizedMessagePart | null;
  normalizePartList(values: unknown[]): NormalizedMessagePart[];
};

export type MessageEnvelopeContext = {
  /** The observation side being normalized — for implementations that
   * construct a message directly instead of recursing. */
  readonly source: "input" | "output";
  /** `source` is closed over by the core — providers cannot mis-thread it. */
  normalizeMessage(
    value: unknown,
    fallbackRole: "user" | "assistant",
  ): NormalizedMessage | null;
  isMessageLike(value: Record<string, unknown>): boolean;
  normalizeFinishReason(
    data: Record<string, unknown>,
    responseMetadata?: Record<string, unknown>,
  ): FinishReason | undefined;
};

export type SiblingPartSlot =
  | "before-content"
  | "after-content"
  | "after-tool-calls";

export type SiblingPartContribution = {
  sourceKey: string; // the field the parts came from, e.g. "thinking"
  slot: SiblingPartSlot;
  parts: NormalizedMessagePart[];
};

type MessageSourceBase = {
  fallbackRole: "user" | "assistant";
};

export type MessageSource =
  | (MessageSourceBase & {
      kind: "single";
      value: unknown;
      roleOverride?: "system";
      /** The record carrying a choice/candidate-level finish reason (the core
       * reads it via `normalizeFinishReason`'s key chain). */
      finishReasonCarrier?: Record<string, unknown>;
    })
  | (MessageSourceBase & {
      kind: "sequence";
      values: unknown[];
    });

export type ToolDefinitionOptions = {
  allowProviderToolWithoutName?: boolean;
  allowToolMap?: boolean;
};

export type ToolDefinitionSource = {
  sourceKey: string;
  value: unknown;
  options?: ToolDefinitionOptions;
};

export type ToolDefinitionCarrier = {
  root?: Record<string, unknown>;
  metadataAttributes?: Record<string, unknown>;
};

export type PartHandler = (
  value: Record<string, unknown>,
  context: PartHandlerContext,
) => ConventionResult<NormalizedMessagePart>;

export interface IOConvention {
  readonly name: string;

  /** Provider finish/stop vocabulary -> canonical set. Lookups lowercased.
   * Overlapping raw values across providers must map identically. */
  readonly finishReasonTypeByRaw?: Readonly<
    Record<string, FinishReason["type"]>
  >;

  /** Lowercased role/author string -> canonical role (gemini `model`,
   * openai deprecated `function`). Same agreement invariant. */
  readonly roleByRawRole?: Readonly<Record<string, NormalizedMessageRole>>;

  /** message.type -> canonical role, used when role/author is absent
   * (langchain `human`/`ai`/`tool`/`system`, openai Responses `reasoning`
   * items which are model output even replayed on the input side). */
  readonly roleByMessageType?: Readonly<Record<string, NormalizedMessageRole>>;

  /** Keys beside the universal `role`/`content` whose presence marks a
   * record as a message container in this dialect (gemini `parts`,
   * langchain `additional_kwargs`, ...). */
  readonly messageLikeKeys?: ReadonlySet<string>;

  /** Keys under which this dialect carries citation payloads (anthropic
   * `citations`, openai `annotations`). The core lifts the first non-empty
   * carrier verbatim into `providerMetadata.citations`. */
  readonly citationKeys?: ReadonlySet<string>;

  /** Messages that are tool *definitions*, not conversation content
   * (koog/Traceloop role-"tool" turns wrapping an OpenAI function tool). */
  isToolDefinitionMessage?(value: Record<string, unknown>): boolean;

  /** Provider-specific raw `type` values ONLY. Shared/contested names
   * (text, image, file, reasoning group) live in normalize/part.ts's
   * SHARED_TYPED_PART_HANDLERS, never here. */
  readonly typedParts?: Readonly<Record<string, PartHandler>>;

  /** Keyed unions without a `type` field (Gemini). */
  tryNormalizeUntypedPart?(
    value: Record<string, unknown>,
    context: PartHandlerContext,
  ): ConventionResult<NormalizedMessagePart>;

  /** Provider-specific string message representations (agno Python reprs). */
  tryPreprocessMessage?(value: string): ConventionResult<unknown>;

  /** Provider-specific message envelopes (langchain lc/kwargs, SK
   * gen_ai.event.content, GenAI choice events). Shapes must stay disjoint
   * across providers. */
  tryUnwrapMessage?(
    value: Record<string, unknown>,
    fallbackRole: "user" | "assistant",
    context: MessageEnvelopeContext,
  ): ConventionResult<NormalizedMessage>;

  /** Parts stored beside the main content field. Cumulative across
   * providers; ordering is by slot, not registry order. */
  collectSiblingParts?(
    value: Record<string, unknown>,
    baseParts: readonly NormalizedMessagePart[],
    context: PartHandlerContext,
  ): SiblingPartContribution[];

  /** Provider-specific message containers at the IO root. The first provider
   * returning a non-empty result claims the conversation. Providers must guard
   * weak keys (for example `output`) so unrelated records do not claim it. */
  claimMessages?(
    root: Record<string, unknown>,
    kind: "input" | "output",
  ): MessageSource[];

  /** Additive system-instruction carrier. It never claims the conversation and
   * is used only when the input messages contain no system message. */
  getSystemMessage?(
    root: Record<string, unknown>,
    kind: "input" | "output",
  ): MessageSource | undefined;

  /** Provider-specific tool-definition carriers (IO root and/or OTel
   * metadata attributes — implementations read the carrier field they own). */
  collectToolDefinitionSources?(
    carrier: ToolDefinitionCarrier,
  ): ToolDefinitionSource[];

  /** Tool-definition ITEM recognizer for this dialect's declaration shapes
   * (openai `function`/`custom` wrappers and flat `format`, anthropic
   * `input_schema`, pydantic-ai `parameters_json_schema`, ai-sdk/MCP
   * `inputSchema`). Items arrive through generic carriers (`root.tools`
   * holds every dialect), so recognition is item-level and cumulative like
   * typed parts. The core's loose fallback handles bare
   * `{name, description, parameters}` items and nameless provider
   * built-ins. Prefer `unmatched` over `claimed(null)` for unconstructible
   * items so the fallback's nameless allowance can still rescue them. */
  tryNormalizeToolDefinition?(
    value: Record<string, unknown>,
  ): ConventionResult<ToolDefinition>;
}
