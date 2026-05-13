/**
 * Encode a dataset identifier for use as a single URL path segment.
 * Dataset names may contain `/` (folders UI); encoding avoids incorrect routing.
 */
export function encodeDatasetPathSegment(datasetId: string): string {
  return encodeURIComponent(datasetId);
}
