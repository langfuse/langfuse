import { request, type FullConfig } from "@playwright/test";

/**
 * Playwright's `webServer.url` check only proves the port answers. `next start`
 * still resolves a route's bundle, its data clients and the NextAuth handlers
 * on the first request that reaches each one, and on a 4-vCPU runner that
 * lands while two browsers are also starting. Whichever test runs first pays
 * the entire cold start, and it is the only test in the run that does.
 *
 * Pay it here instead, where nothing is asserting.
 */
const WARM_UP_PATHS = [
  "/auth/sign-in",
  "/api/auth/providers",
  "/api/auth/csrf",
  "/api/auth/session",
];

const TOTAL_BUDGET_MS = 120_000;
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 500;

export default async function warmUp(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const context = await request.newContext({ baseURL });

  try {
    for (const path of WARM_UP_PATHS) {
      // Playwright has moved `globalSetup` relative to `webServer` across
      // versions, so retry rather than depend on an ordering.
      let warmed = false;
      while (!warmed && Date.now() < deadline) {
        try {
          // A 5xx is the server telling us it is not ready yet — the exact
          // state being warmed away — so it is worth another go. Anything
          // below that means the route resolved and ran, which is all this
          // needs; a 404 would mean the path is simply wrong, and retrying
          // that would burn the whole budget for nothing.
          const response = await context.get(path, {
            timeout: REQUEST_TIMEOUT_MS,
          });
          if (response.status() >= 500) {
            throw new Error(`${path} answered ${response.status()}`);
          }
          warmed = true;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
      // Warming is an optimisation, not a gate: a run that would have passed
      // must not go red over a request no test is making. Say so and move on.
      if (!warmed) console.warn(`[warm-up] gave up on ${path}`);
    }
  } finally {
    await context.dispose();
  }
}
