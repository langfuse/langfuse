// "executing api route (pages|app) <route>" is Next's route-handler span name;
// it exposes the resolved template before the handler runs, while http.server is
// still open. Pinned against the installed Next by the colocated servertest.
const nextApiRouteSpanNamePattern =
  /^executing api route \((?:pages|app)\) (.+)$/;

/** extractNextApiRoute returns the route template from a Next route-handler span name */
export function extractNextApiRoute(spanName: string): string | undefined {
  return nextApiRouteSpanNamePattern.exec(spanName)?.[1];
}
