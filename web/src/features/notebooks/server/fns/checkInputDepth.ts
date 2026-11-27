import { InvalidRequestError } from "@langfuse/shared";
import {
  MAX_NOTEBOOK_DOCUMENT_BYTES,
  MAX_NOTEBOOK_NESTING,
} from "../../schema";

export function checkInputDepth(values: unknown[]) {
  const pending = values.map((value) => ({ value, depth: 0 }));
  let count = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (depth > MAX_NOTEBOOK_NESTING || ++count > MAX_NOTEBOOK_DOCUMENT_BYTES) {
      throw new InvalidRequestError(
        "Document is too large or nested too deeply.",
      );
    }
    if (value && typeof value === "object") {
      for (const child of Object.values(value))
        pending.push({ value: child, depth: depth + 1 });
    }
  }
}
