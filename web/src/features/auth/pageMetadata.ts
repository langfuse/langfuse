/**
 * Document titles rendered during server-side rendering.
 *
 * `AppLayout` gates every page behind `useSession()`, which is always
 * `"loading"` on the server, so the layout returns a spinner and the page
 * component — including its `next/head` block — never renders server-side.
 * The served HTML therefore carried no `<title>` at all.
 *
 * `_app` renders outside that gate, so it supplies the title from this map
 * before the session resolves. Page-level `next/head` blocks still win once
 * they mount on the client, and they read their strings from here so there is
 * one source of truth.
 *
 * Only public, crawlable routes need an entry; everything else is behind auth
 * and gets `DEFAULT_PAGE_TITLE`.
 */

export const DEFAULT_PAGE_TITLE = "Langfuse";

export const SIGN_IN_PAGE_TITLE = "Sign in | Langfuse";
export const SIGN_UP_PAGE_TITLE = "Sign up | Langfuse";

type PageMetadata = {
  title: string;
  description?: string;
};

/** Keyed by `router.pathname`, so the values are route patterns, not URLs. */
const PUBLIC_PAGE_METADATA: Record<string, PageMetadata> = {
  "/auth/sign-in": {
    title: SIGN_IN_PAGE_TITLE,
    description:
      "Sign in to Langfuse to trace, evaluate, and debug your LLM applications.",
  },
  "/auth/sign-up": {
    title: SIGN_UP_PAGE_TITLE,
    description:
      "Create a free Langfuse account to trace, evaluate, and debug your LLM applications.",
  },
};

export function getPageMetadata(pathname: string): PageMetadata {
  return PUBLIC_PAGE_METADATA[pathname] ?? { title: DEFAULT_PAGE_TITLE };
}
