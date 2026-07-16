import { useMemo } from "react";
import { Download } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { LARGE_STRING_PREVIEW_CHARS } from "@/src/components/ui/largeStringGate";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/**
 * Bounded fallback for a single top-level string value too large to render in
 * the Pretty / JSON viewers (LFE-10991, part of the LFE-10152 large-traces
 * work). Instead of running several full-length parse/decode/stringify passes
 * on the main thread and mounting the unvirtualized JSON tree with the whole
 * multi-MB string — which blocks the tab and inflates memory — it shows a
 * bounded preview head plus a raw download for the full value. The header's
 * copy button (in PrettyJsonView) still copies the whole string.
 *
 * This never re-serializes the payload: the value is already a plain string,
 * reused as-is for the preview slice and the download.
 */
export function LargeStringFallback({
  title,
  value,
}: {
  title?: string;
  value: string;
}) {
  const capture = usePostHogClientCapture();

  const previewText = useMemo(
    () =>
      value.length > LARGE_STRING_PREVIEW_CHARS
        ? value.slice(0, LARGE_STRING_PREVIEW_CHARS)
        : value,
    [value],
  );

  const onDownload = () => {
    capture("trace_detail:large_string_field_download");
    // Raw .txt: the source value is already a plain string, so it must never be
    // JSON-quote/escape-wrapped.
    const base = (title ?? "value").toLowerCase().replace(/\s+/g, "-");
    downloadTextFile(value, `${base}.txt`, "text/plain; charset=utf-8");
  };

  return (
    <div className="io-message-content">
      <div className="my-2 flex flex-col gap-2 rounded-sm border border-dashed p-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
          {title ? (
            <span className="text-foreground font-medium">{title}</span>
          ) : null}
          <span>
            Large string — {compactNumberFormatter(value.length, 1)} characters,
            truncated to keep the tab responsive
          </span>
        </div>
        <pre className="bg-muted/50 max-h-40 overflow-hidden rounded-md border p-2 font-mono text-xs break-all whitespace-pre-wrap">
          {previewText}
        </pre>
        <div>
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Download full value
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
