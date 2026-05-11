export interface ServerTraceDownloadParams {
  traceId: string;
  projectId: string;
}

export function buildTraceDownloadUrl({
  traceId,
  projectId,
}: ServerTraceDownloadParams): string {
  const query = new URLSearchParams({
    projectId,
  });

  return `/api/traces/${encodeURIComponent(traceId)}/download?${query.toString()}`;
}

function hasErrorMessage(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}

export interface LegacyTraceDownloadParams {
  trace: {
    id: string;
    [key: string]: unknown;
  };
  observations: unknown[];
  filename?: string;
}

function downloadBlob(params: { blob: Blob; filename: string }) {
  const { blob, filename } = params;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadServerTraceAsJson(
  params: ServerTraceDownloadParams,
) {
  const { traceId, projectId } = params;
  const response = await fetch(buildTraceDownloadUrl({ traceId, projectId }), {
    method: "GET",
    credentials: "same-origin",
  });

  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null);
    throw new Error(
      hasErrorMessage(errorBody)
        ? errorBody.message
        : "Failed to download trace JSON",
    );
  }

  const blob = await response.blob();
  downloadBlob({
    blob,
    filename: `trace-${encodeURIComponent(traceId)}.json`,
  });
}

export function downloadLegacyTraceAsJson(params: LegacyTraceDownloadParams) {
  const { trace, observations, filename } = params;
  const exportData = {
    trace,
    observations,
  };

  downloadBlob({
    blob: new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json; charset=utf-8",
    }),
    filename: filename || `trace-${trace.id}.json`,
  });
}
