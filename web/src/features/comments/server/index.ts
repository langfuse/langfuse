// The comments feature's public server surface (RFC rules 8 and 10).
// commentsRouter stays a direct import from the tRPC root.
export {
  createCommentForApi,
  getCommentForApi,
  listCommentsForApi,
} from "@/src/features/comments/server/publicCommentService";
