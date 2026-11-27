export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(2)}s`;
  const pad = (value: number) => String(value).padStart(2, "0");
  if (ms < 3_600_000) {
    return `${Math.floor(ms / 60_000)}m ${pad(Math.floor((ms % 60_000) / 1_000))}s`;
  }
  return `${Math.floor(ms / 3_600_000)}h ${pad(Math.floor((ms % 3_600_000) / 60_000))}m`;
}
