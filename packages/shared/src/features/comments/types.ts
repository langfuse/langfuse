import { z } from "zod/v4";

const MAX_COMMENT_LENGTH = 5000;

export const COMMENT_OBJECT_TYPES = [
  "TRACE",
  "OBSERVATION",
  "SESSION",
  "PROMPT",
] as const;

export const COMMENT_DATA_FIELDS = ["input", "output", "metadata"] as const;

// JSON Path validation
// TODO: simplify
// Allows: $ (root), $.foo, $[0], $.foo[0].bar, $['key-with-dash'], etc.
export const jsonPathSchema = z
  .string()
  .regex(
    /^\$(\.[a-zA-Z_][a-zA-Z0-9_-]*|\[\d+\]|\['[^']+'\]|\["[^"]+"\])*$/,
    "Invalid JSON Path syntax",
  );

export const CreateCommentData = z
  .object({
    projectId: z.string(),
    content: z.string().trim().min(1).max(MAX_COMMENT_LENGTH),
    objectId: z.string(),
    objectType: z.enum(COMMENT_OBJECT_TYPES),
    // Optional inline positioning (parallel arrays)
    dataField: z.enum(COMMENT_DATA_FIELDS).nullish(),
    path: z.array(jsonPathSchema).nullish(),
    rangeStart: z.array(z.number().int().min(0)).nullish(),
    rangeEnd: z.array(z.number().int().min(1)).nullish(),
  })
  .refine(
    (data) => {
      const hasDataField = data.dataField != null;
      const hasPath = data.path != null && data.path.length > 0;
      const hasRangeStart =
        data.rangeStart != null && data.rangeStart.length > 0;
      const hasRangeEnd = data.rangeEnd != null && data.rangeEnd.length > 0;

      // All must be set together, or all must be null/empty
      if (hasDataField || hasPath || hasRangeStart || hasRangeEnd) {
        return (
          hasDataField &&
          hasPath &&
          hasRangeStart &&
          hasRangeEnd &&
          data.path!.length === data.rangeStart!.length &&
          data.path!.length === data.rangeEnd!.length
        );
      }
      return true;
    },
    {
      message:
        "dataField, path, rangeStart, rangeEnd must all be set together with matching lengths, or all be null/empty",
    },
  )
  .refine(
    (data) => {
      // Validate each range: start must be < end
      if (data.rangeStart && data.rangeEnd) {
        return data.rangeStart.every((start, i) => start < data.rangeEnd![i]);
      }
      return true;
    },
    { message: "Each rangeStart must be less than corresponding rangeEnd" },
  );

export const DeleteCommentData = z.object({
  projectId: z.string(),
  commentId: z.string(),
  objectId: z.string(),
  objectType: z.enum(COMMENT_OBJECT_TYPES),
});

export type CreateCommentInput = z.infer<typeof CreateCommentData>;
