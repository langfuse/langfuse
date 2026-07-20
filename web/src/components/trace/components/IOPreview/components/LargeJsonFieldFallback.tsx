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
 * This component never serializes the payload: the caller's size probe already
 * did that once and passes the `serialized` string in, reused here for both the
 * preview slice and the download. Re-serializing a ~20 MB object here would
 * partly defeat the gate.
 */
export function LargeJsonFieldFallback({
  title,
  serialized,
  isString,
  charCount,
  downloadFileBase,
}: {
  title: string;
  /** Pre-serialized content: raw text for string fields, compact JSON for
   *  objects. Used as-is for both the preview and the download. */
  serialized: string;
  /** True when the source value was a string — downloads as raw .txt so
   *  base64/plain payloads are not quote/escape-wrapped; objects use .json. */
  isString: boolean;
  charCount: number;
  /** File name without extension. */
  downloadFileBase: string;
}) {
  const capture = usePostHogClientCapture();

  const previewText = useMemo(
    () =>
      serialized.length > PREVIEW_DISPLAY_CHARS
        ? serialized.slice(0, PREVIEW_DISPLAY_CHARS)
        : serialized,
    [serialized],
  );

  const onDownload = () => {
    capture("trace_detail:json_view_large_field_download");
    // Reuse the already-serialized string as-is: raw text for strings (never
    // JSON-quoted), compact JSON for objects. No re-serialization here.
    const extension = isString ? "txt" : "json";
    const mimeType = isString
      ? "text/plain; charset=utf-8"
      : "application/json; charset=utf-8";
    downloadTextFile(serialized, `${downloadFileBase}.${extension}`, mimeType);
  };

  return (
    <div className="io-message-content">
      <div className="my-2 flex flex-col gap-2 rounded-sm border border-dashed p-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
          <span className="text-foreground font-bold">{title}</span>
          <span>
            {compactNumberFormatter(charCount, 1)} characters — too large to
            render in JSON view
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          Rendering this much JSON at once freezes the tab. Use the{" "}
          <span className="font-bold">Formatted</span> or{" "}
          <span className="font-bold">JSON Beta</span> view for the full
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
