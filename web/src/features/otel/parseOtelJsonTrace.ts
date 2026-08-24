export type OtelJsonTraceParseResult =
  | { success: true; resourceSpans: unknown[] }
  | { success: false; error: string };

function formatOtelJsonSyntaxError(error: unknown): string {
  const details = error instanceof Error ? `: ${error.message}` : "";

  return `Failed to parse OTel JSON Trace${details}. Ensure the request body is valid OTLP JSON with a top-level resourceSpans array and Content-Type: application/json.`;
}

export function parseOtelJsonTrace(body: Buffer): OtelJsonTraceParseResult {
  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(body.toString());
  } catch (error) {
    return { success: false, error: formatOtelJsonSyntaxError(error) };
  }

  const resourceSpans =
    typeof parsedBody === "object" && parsedBody !== null
      ? (parsedBody as { resourceSpans?: unknown }).resourceSpans
      : undefined;

  if (!Array.isArray(resourceSpans)) {
    return {
      success: false,
      error:
        "Failed to parse OTel JSON Trace: expected a top-level resourceSpans array in the OTLP JSON payload.",
    };
  }

  return { success: true, resourceSpans };
}
