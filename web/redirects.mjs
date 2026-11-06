/** renamedRouteRedirects forwards the URLs of renamed product surfaces to their current paths. */
export const renamedRouteRedirects = [
  {
    source: "/project/:projectId/monitors/:path*",
    destination: "/project/:projectId/alerts/:path*",
    permanent: true,
  },
  {
    // The experiments Analytics tab was a "Coming Soon" card; its aggregates
    // move into the results table. The list is the destination rather than
    // `results`, which needs a `baseline` an old analytics bookmark never
    // carried. Temporary, so a future analytics surface at this path is not
    // shadowed by a cached 308.
    source: "/project/:projectId/experiments/analytics",
    destination: "/project/:projectId/experiments",
    permanent: false,
  },
  // The AI Gateway moved out of organization settings into its own section.
  {
    source: "/organization/:organizationId/settings/ai-gateway",
    destination: "/organization/:organizationId/ai-gateway/setup",
    permanent: false,
  },
  {
    source: "/organization/:organizationId/settings/ai-gateway-analytics",
    destination: "/organization/:organizationId/ai-gateway",
    permanent: false,
  },
  ...["models", "api-keys"].map((page) => ({
    source: `/organization/:organizationId/settings/ai-gateway-${page}`,
    destination: `/organization/:organizationId/ai-gateway/${page}`,
    permanent: false,
  })),
];
