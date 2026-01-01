import { useMemo } from "react";

type CommentRange = { start: number; end: number };
type CommentPathMap = Map<string, Array<CommentRange>>;

interface CommentWithPosition {
  dataField: string | null;
  path: string[];
  rangeStart: number[];
  rangeEnd: number[];
}

interface CommentedPathsByField {
  input?: CommentPathMap;
  output?: CommentPathMap;
  metadata?: CommentPathMap;
}

/**
 * Builds Maps of JSON paths to comment ranges, keyed by field (input/output/metadata).
 * Used to highlight commented text in the JSON viewer.
 */
export function useCommentedPaths(
  comments: CommentWithPosition[] | undefined,
): CommentedPathsByField | undefined {
  return useMemo(() => {
    if (!comments) return undefined;

    const inputMap = new Map<string, Array<CommentRange>>();
    const outputMap = new Map<string, Array<CommentRange>>();
    const metadataMap = new Map<string, Array<CommentRange>>();

    for (const comment of comments) {
      // Only process comments with position data (inline comments)
      if (
        comment.dataField &&
        comment.path &&
        comment.path.length > 0 &&
        comment.rangeStart &&
        comment.rangeStart.length > 0 &&
        comment.rangeEnd &&
        comment.rangeEnd.length > 0
      ) {
        // Each path[i] gets its corresponding range from rangeStart[i]/rangeEnd[i]
        comment.path.forEach((jsonPath, i) => {
          const range = {
            start: comment.rangeStart[i]!,
            end: comment.rangeEnd[i]!,
          };

          let targetMap;
          if (comment.dataField === "input") targetMap = inputMap;
          else if (comment.dataField === "output") targetMap = outputMap;
          else if (comment.dataField === "metadata") targetMap = metadataMap;
          else return;

          const existing = targetMap.get(jsonPath) || [];
          targetMap.set(jsonPath, [...existing, range]);
        });
      }
    }

    return {
      input: inputMap.size > 0 ? inputMap : undefined,
      output: outputMap.size > 0 ? outputMap : undefined,
      metadata: metadataMap.size > 0 ? metadataMap : undefined,
    };
  }, [comments]);
}
