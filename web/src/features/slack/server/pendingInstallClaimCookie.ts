import { type NextApiResponse } from "next";
import { SLACK_PENDING_INSTALL_TTL_MS } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

/**
 * httpOnly cookie that carries the one-time claim token authorizing a pending
 * Marketplace install to be linked to a project.
 *
 * Why a cookie and not a URL parameter: the claim is a bearer credential — it
 * unlocks a live Slack bot token (chat:write). In a URL it leaks via browser
 * history, bookmarks, and Referer headers, and can be replayed from any client
 * for the whole TTL. As an httpOnly, SameSite cookie it is bound to the browser
 * that completed the OAuth install (the only party that should be able to link
 * it) and is never exposed to page JavaScript. The slack tRPC procedures read
 * it server-side from the request headers; the page never sees it.
 *
 * The OAuth callback (which has the response object) sets it. There is no
 * explicit clear: it is httpOnly (JS can't clear it), expires with the pending
 * row's TTL, and is inert after a successful link (the row is consumed, so the
 * claim no longer matches anything).
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
  const secure = env.NEXTAUTH_URL?.startsWith("https://") ?? false;
  const cookie = [
    `${PENDING_INSTALL_CLAIM_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
  appendSetCookie(res, cookie);
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
