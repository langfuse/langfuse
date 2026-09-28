import { env } from "@/src/env.mjs";

/**
 * Whether the instance usage page is available on this deployment.
 *
 * Self-hosted only: Langfuse Cloud has org-scoped usage views, and an
 * instance-wide aggregate would cross tenant boundaries there.
 *
 * PR previews are the one exception. They build with
 * `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION=DEV` (see .github/workflows/preview-build.yml),
 * so a plain region check would hide the page from exactly the environment we
 * review it in. Both conditions must hold — the DEV region AND a preview PR URL,
 * which only the preview build sets — so a stray preview variable can never
 * re-admit a real region (US/EU/STAGING/HIPAA/JP).
 */
export const isInstanceUsageAvailable = (): boolean =>
  !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ||
  (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" &&
    Boolean(env.NEXT_PUBLIC_PREVIEW_PR_URL));
