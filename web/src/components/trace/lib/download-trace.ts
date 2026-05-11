/**
 * Helper function for downloading trace data as JSON
 */

export interface DownloadTraceAsJsonParams {
  trace: {
    id: string;
    [key: string]: unknown;
  };
  observations: unknown[];
  filename?: string;
}

/**
 * Download trace data with observations as JSON file
 *
 * @param params - Configuration object
 * @param params.trace - Trace object to download
 * @param params.observations - Array of observations (can be basic or with full I/O data)
 * @param params.filename - Optional custom filename (defaults to trace-{traceId}.json)
 */
export function downloadTraceAsJson(params: DownloadTraceAsJsonParams): void {
  const { trace, observations, filename } = params;

  const exportData = {
    trace,
    observations,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], {
    type: "application/json; charset=utf-8",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `trace-${trace.id}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
