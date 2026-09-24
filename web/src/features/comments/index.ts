// The comments feature's public client surface (RFC rule 8). Named
// re-exports only — the drawer and list other features already imported
// by file path.
//
// CommentCountIcon, MentionBadge, mentionParser, and the IOPreview
// inline-comment components stay deep: putting them here would load the
// drawer into SpanContent, MarkdownViewer, and IOPreviewJSON. Pages and
// commentsRouter stay off this door.
export {
  CommentDrawerController,
  getCommentDrawerInitialStateFromUrl,
} from "@/src/features/comments/CommentDrawerController";
export { CommentList } from "@/src/features/comments/CommentList";
export { useCommentedPaths } from "@/src/features/comments/hooks/useCommentedPaths";
