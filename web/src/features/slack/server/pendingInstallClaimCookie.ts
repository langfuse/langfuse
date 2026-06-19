import { type NextApiResponse } from "next";
import { SLACK_PENDING_INSTALL_TTL_MS } from "@langfuse/shared/src/server";
import { getCookieOptions } from "@/src/server/utils/cookies";

/**
 * httpOnly cookie carrying the one-time claim that authorizes linking a pending
 * Marketplace install to a project. Delivered as a cookie rather than a URL
 * parameter so that someone who intercepts the onboarding URL (browser history,
 * bookmarks, Referer) can't replay the claim to connect another person's Slack
 * workspace to their own Langfuse project. Set on the OAuth callback and read
 * server-side by the slack tRPC procedures.
 */
export const PENDING_INSTALL_CLAIM_COOKIE = "slack_pending_install_claim";

// Match the pending-install TTL so the cookie can't outlive the row it unlocks.
const MAX_AGE_SECONDS = Math.floor(SLACK_PENDING_INSTALL_TTL_MS / 1000);

// Bind the claim to its workspace so a stale cookie from a previous install
// can't be applied to a different team_id.
type ClaimCookiePayload = { teamId: string; claim: string };

export function setPendingInstallClaimCookie(
  res: NextApiResponse,
  teamId: string,
  claim: string,
): void {
  const value = encodeURIComponent(
    JSON.stringify({ teamId, claim } satisfies ClaimCookiePayload),
  );
  // Reuse the shared cookie defaults (same as the project cookie / next-auth)
  // so secure/domain/path behave consistently — notably `secure` is set on
  // Vercel deploys where NEXTAUTH_URL omits the protocol.
  const options = getCookieOptions();
  const parts = [
    `${PENDING_INSTALL_CLAIM_COOKIE}=${value}`,
    `Path=${options.path}`,
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ];
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  appendSetCookie(res, parts.join("; "));
}

/**
 * Read and validate the claim cookie for a given workspace. Returns the raw
 * claim only when the cookie is present and bound to the same team_id.
 */
export function readPendingInstallClaimCookie(
  cookieHeader: string | undefined,
  teamId: string,
): string | null {
  const raw = parseCookie(cookieHeader, PENDING_INSTALL_CLAIM_COOKIE);
  if (!raw) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(raw)) as ClaimCookiePayload;
    if (payload.teamId !== teamId || !payload.claim) return null;
    return payload.claim;
  } catch {
    return null;
  }
}

// res.setHeader overwrites; @slack/oauth's handleCallback already sets a
// Set-Cookie (clearing the OAuth state cookie), so append rather than clobber.
function appendSetCookie(res: NextApiResponse, cookie: string): void {
  const existing = res.getHeader("Set-Cookie");
  const cookies = Array.isArray(existing)
    ? existing.map(String)
    : existing
      ? [String(existing)]
      : [];
  cookies.push(cookie);
  res.setHeader("Set-Cookie", cookies);
}

function parseCookie(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim();
    }
  }
  return null;
}
