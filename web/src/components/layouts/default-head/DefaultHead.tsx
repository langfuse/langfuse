import Head from "next/head";
import { useRouter } from "next/router";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { getPageMetadata } from "./getPageMetadata";

/**
 * Rendered in `_app` outside the layout, so it is part of every server
 * response — including the session-loading shell that is all a crawler gets.
 * Pages that render their own `<Head>` still win: `next/head` keeps the last
 * `<title>` and dedupes `<meta>` by name.
 */
export function DefaultHead() {
  const { pathname } = useRouter();
  const { region } = useLangfuseCloudRegion();
  const { title, description, canonicalUrl } = getPageMetadata(
    pathname,
    region,
  );

  return (
    <Head>
      <title>{title}</title>
      <meta property="og:title" content={title} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Langfuse" />
      {description && (
        <>
          <meta name="description" content={description} />
          <meta property="og:description" content={description} />
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
