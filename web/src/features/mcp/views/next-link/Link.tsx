import { type ComponentProps } from "react";

/**
 * Stands in for `next/link` in MCP App views, which run outside Next.js
 * (see scripts/build-mcp-apps.mjs). Renders a plain anchor.
 */
export default function Link({
  href,
  ...props
}: Omit<ComponentProps<"a">, "href"> & {
  href: string | { pathname?: string };
}) {
  return (
    <a href={typeof href === "string" ? href : href.pathname} {...props} />
  );
}
