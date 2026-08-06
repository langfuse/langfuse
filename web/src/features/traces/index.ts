// The traces feature's public surface (RFC rule 8). Named re-exports only —
// this is the whole list of what anything outside the feature may use, and it
// starts as exactly what they already imported, nothing added for the future.
//
// Client-safe by construction: `server/` is deliberately absent, so importing
// this can never pull Prisma or ClickHouse into a browser bundle. The three
// server-side consumers of `server/legacyIoSearch` still import it directly —
// a full-stack feature needs a second, server-side surface, which the RFC does
// not have a rule for yet.

export { Trace } from "@/src/features/traces/components/Trace";
export { TracePage } from "@/src/features/traces/TracePage";
export { TraceDetailActions } from "@/src/features/traces/components/TraceDetailActions";
export { TraceDetailBody } from "@/src/features/traces/components/TraceDetailBody";
export { traceDetailTitle } from "@/src/features/traces/fns/traceDetailTitle";
export { useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";

export { BreakdownTooltip } from "@/src/features/traces/components/BreakdownTooltip";
export { CopyIdsPopover } from "@/src/features/traces/components/CopyIdsPopover";

export {
  IOPreview,
  type IOPreviewContentMode,
  type ViewMode,
} from "@/src/features/traces/components/IOPreview/IOPreview";
export { ChatMessageList } from "@/src/features/traces/components/ChatMessageList";
export { ThinkingBlock } from "@/src/features/traces/components/ThinkingBlock";
export {
  hasRenderableConversationMessages,
  isOnlyJsonMessage,
} from "@/src/features/traces/fns/chatMessageUtils";
export {
  useChatMLParser,
  type ChatMLParserResult,
} from "@/src/features/traces/hooks/useChatMLParser";

// The JSON viewer's comment-range contract. It cannot be promoted to
// `src/fns` — it depends on the viewer's own path and row types — so the
// feature surface is where the comments feature reaches it.
export {
  type CommentRange,
  type CommentedPathsByField,
} from "@/src/features/traces/components/AdvancedJsonViewer/utils/commentRanges";
