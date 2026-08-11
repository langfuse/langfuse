/** renamedRouteRedirects forwards the URLs of renamed product surfaces to their current paths. */
export const renamedRouteRedirects = [
  {
    source: "/project/:projectId/monitors/:path*",
    destination: "/project/:projectId/alerts/:path*",
    permanent: true,
  },
];
