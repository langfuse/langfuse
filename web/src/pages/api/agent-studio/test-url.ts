import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/src/server/auth";

// Self-hosted deployments may run LangGraph servers on the same machine.
// Set LANGFUSE_AGENT_STUDIO_ALLOW_LOOPBACK=true to permit 127.x / localhost URLs.
const allowLoopback =
  process.env.LANGFUSE_AGENT_STUDIO_ALLOW_LOOPBACK === "true";

// Reject URLs pointing at private/internal network ranges to prevent SSRF.
// Covers RFC-1918, loopback, link-local, and common internal TLDs.
// Loopback is conditionally allowed when allowLoopback=true (self-hosted).
function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  // Loopback — conditionally allowed for self-hosted deployments
  const isLoopback = h === "localhost" || /^127\./.test(h) || h === "::1";
  if (isLoopback) return !allowLoopback;

  // RFC-1918 private ranges and link-local
  if (
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h)
  )
    return true;

  // Internal TLDs and IPv6 private ranges
  if (
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".intranet") ||
    /^fe80:/i.test(h) ||
    /^fc[0-9a-f]{2}:/i.test(h)
  )
    return true;

  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const { url } = req.body as { url?: string };
  if (!url)
    return res.status(400).json({ success: false, error: "url required" });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return res.json({ success: false, error: "Invalid URL" });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return res
      .status(400)
      .json({ success: false, error: "Only http and https URLs are allowed" });
  }

  if (isBlockedHostname(parsed.hostname)) {
    return res.status(400).json({
      success: false,
      error: "Private or internal URLs are not allowed",
    });
  }

  try {
    const response = await fetch(`${url}/assistants/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return res.json({ success: false, error: `HTTP ${response.status}` });
    }
    return res.json({ success: true });
  } catch {
    // Do not echo raw error messages — they may contain internal host info
    return res.json({ success: false, error: "Connection failed" });
  }
}
