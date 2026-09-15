import { classifyMediaValue } from "@/src/components/ui/media/mediaUtils";
import { type DatasetItemMediaField } from "@langfuse/shared";

/**
 * Walks dataset-item JSON and replaces third-party media URLs with
 * `@@@langfuseMedia:...@@@` tokens. Existing Langfuse tokens are left unchanged.
 */
export async function rewriteCsvFieldMedia(
  value: unknown,
  field: DatasetItemMediaField,
  convertUrl: (url: string, field: DatasetItemMediaField) => Promise<string>,
): Promise<unknown> {
  if (typeof value === "string") {
    const kind = classifyMediaValue(value)?.kind;
    if (kind === "url") return convertUrl(value, field);
    return value;
  }

  if (Array.isArray(value)) {
    return Promise.all(
      value.map((entry) => rewriteCsvFieldMedia(entry, field, convertUrl)),
    );
  }

  if (value !== null && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, entry]) => [
        key,
        await rewriteCsvFieldMedia(entry, field, convertUrl),
      ]),
    );
    return Object.fromEntries(entries);
  }

  return value;
}
