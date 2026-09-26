import type { MetadataRoute } from "next";

/**
 * Crawler policy for the Cloud app origin. Matches X-Robots-Tag in
 * `next.config.mjs`: `/` and `/auth*` may be indexed; everything else is
 * disallowed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/auth"],
      disallow: "/",
    },
  };
}
