import Head from "next/head";
import { useRouter } from "next/router";
import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { useLayoutMetadata } from "@/src/components/layouts/app-layout/hooks/useLayoutMetadata";
import { getPageMetadata } from "./getPageMetadata";

/**
 * Rendered in `_app` outside the layout, so it is part of every server
 * response — including the session-loading shell that is all a crawler gets.
 * Pages that render their own `<Head>` still win: `next/head` keeps the last
 * `<title>`, dedupes `<meta>` by name and `<link>` by `key`. The icon keys
 * match AuthenticatedLayout so its region-aware icons replace these.
 */
export function DefaultHead() {
  const { pathname } = useRouter();
  const { region } = useLangfuseCloudRegion();
  const { title, description, canonicalUrl } = getPageMetadata(
    pathname,
    region,
  );
  const icons = useLayoutMetadata(undefined, []);

  return (
    <Head>
      <title>{title}</title>
      <link
        key="favicon-svg"
        rel="icon"
        type="image/svg+xml"
        href={icons.faviconPath}
      />
      <link
        key="favicon-png"
        rel="icon"
        type="image/png"
        sizes="256x256"
        href={icons.favicon256Path}
      />
      <link
        key="apple-touch-icon"
        rel="apple-touch-icon"
        href={icons.appleTouchIconPath}
      />
      {/* Open Graph only where the copy is route-specific; a generic
          og:title would shadow the title unmapped pages set themselves. */}
      {description && (
        <>
          <meta name="description" content={description} />
          <meta property="og:title" content={title} />
          <meta property="og:description" content={description} />
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Langfuse" />
        </>
      )}
      {canonicalUrl && (
        <>
          <link rel="canonical" href={canonicalUrl} />
          <meta property="og:url" content={canonicalUrl} />
        </>
      )}
    </Head>
  );
}
