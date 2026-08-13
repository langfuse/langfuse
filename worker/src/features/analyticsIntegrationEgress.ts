/**
 * Redirect budget for the analytics integration exporters. Both senders
 * previously used a plain fetch, which auto-follows up to 20 redirects, so the
 * budget stays generous enough not to break a self-hosted endpoint behind a
 * redirecting edge. Mirrors MAX_LLM_REDIRECTS on the LLM egress path.
 */
export const ANALYTICS_INTEGRATION_MAX_REDIRECTS = 10;
