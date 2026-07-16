import { useMemo } from "react";
import { Download } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/** How much of the raw payload the preview head shows. Bounded regardless of
 *  payload size — the full value is reachable via download or the other views. */
const PREVIEW_DISPLAY_CHARS = 4_000;

/**
 * Fallback for a single JSON-view field (Input / Output / Metadata) whose
 * payload is too large to render in the unvirtualized react18-json-view
 * (LFE-10989). Instead of parsing + rendering the full tree on the main thread
 * — which freezes for seconds and crashes the renderer around ~20 MB — it
 * shows a bounded preview head plus escape hatches: a raw download, and a
 * pointer to the Formatted (lazy) and JSON Beta (virtualized) views that scale.
 *
 * The raw value is only serialized for the bounded preview and, on click, the
 * download. It is never handed to the JSON tree renderer.
 */
export function LargeJsonFieldFallback({
  title,
  value,
  charCount,
  downloadFileBase,
}: {
  title: string;
  value: unknown;
  charCount: number;
  /** File name without extension; string values download as raw .txt, objects
   *  as .json (matching how the value is actually serialized below). */
  downloadFileBase: string;
}) {
  const capture = usePostHogClientCapture();
  const isString = typeof value === "string";

  // Serialize once for the preview head. This is the rare, gated path (payload
  // already over the multi-MB limit), so a single bounded stringify here is far
  // cheaper than the parse + unvirtualized render it replaces. String values
  // are shown raw — JSON-wrapping them would add quotes + escapes (e.g. a
  // base64 payload would be over-encoded).
  const previewText = useMemo(() => {
    const text = isString ? (value as string) : safeStringify(value);
    return text.length > PREVIEW_DISPLAY_CHARS
      ? text.slice(0, PREVIEW_DISPLAY_CHARS)
      : text;
  }, [value, isString]);

  const onDownload = () => {
    capture("trace_detail:json_view_large_field_download");
    // Download the value as-is: raw text for strings, pretty JSON for objects.
    // Never JSON.stringify a string here — that would quote/escape the payload.
    const content = isString ? (value as string) : safeStringify(value, 2);
    const extension = isString ? "txt" : "json";
    const mimeType = isString
      ? "text/plain; charset=utf-8"
      : "application/json; charset=utf-8";
    downloadTextFile(content, `${downloadFileBase}.${extension}`, mimeType);
  };

  return (
    <div className="io-message-content">
      <div className="my-2 flex flex-col gap-2 rounded-sm border border-dashed p-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
          <span className="text-foreground font-medium">{title}</span>
          <span>
            {compactNumberFormatter(charCount, 1)} characters — too large to
            render in JSON view
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          Rendering this much JSON at once freezes the tab. Use the{" "}
          <span className="font-medium">Formatted</span> or{" "}
          <span className="font-medium">JSON Beta</span> view for the full
          payload, or download it below.
        </p>
        <pre className="bg-muted/50 max-h-40 overflow-hidden rounded-md border p-2 font-mono text-xs break-all whitespace-pre-wrap">
          {previewText}
        </pre>
        <div>
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Download {title}
          </Button>
        </div>
      </div>
    </div>
  );
}

function safeStringify(value: unknown, space?: number): string {
  try {
    return JSON.stringify(value, null, space) ?? "";
  } catch {
    return "";
  }
}

function downloadTextFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
