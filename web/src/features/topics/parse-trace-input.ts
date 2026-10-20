import { topicTraceIdSchema } from "@langfuse/shared/topics";

/** Links are identifiers only: the pipeline never fetches a pasted URL. */
export function parseTraceInput(
  text: string,
  projectId: string,
  origin: string,
): string[] {
  const ids = text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((value) => {
      if (!value.includes("://")) return topicTraceIdSchema.parse(value);
      const url = new URL(value);
      const match = /^\/project\/([^/]+)\/traces\/([^/]+)\/?$/.exec(
        url.pathname,
      );
      if (
        url.origin !== origin ||
        url.username ||
        url.password ||
        !match ||
        match[1] !== projectId
      ) {
        throw new Error(
          "Use trace IDs or trace links from this project on this instance.",
        );
      }
      return topicTraceIdSchema.parse(decodeURIComponent(match[2]));
    });
  const unique = [...new Set(ids)];
  if (!unique.length) throw new Error("Provide at least one trace.");
  return unique;
}
