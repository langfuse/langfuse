import { InvalidRequestError } from "@langfuse/shared";
import { MAX_NOTEBOOK_DOCUMENT_BYTES } from "../../schema";

export function parseJsonl(jsonl: string): unknown[] {
  if (Buffer.byteLength(jsonl) > MAX_NOTEBOOK_DOCUMENT_BYTES) {
    throw new InvalidRequestError("Document exceeds the size limit.");
  }
  const content = jsonl.replace(/\r?\n$/, "");
  return content
    ? content.split(/\r?\n/).map((line, index) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          throw new InvalidRequestError(
            `Invalid JSON on document line ${index + 1}.`,
          );
        }
      })
    : [];
}
