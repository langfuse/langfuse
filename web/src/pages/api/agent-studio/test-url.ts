import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/src/server/auth";

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

  try {
    new URL(url);
  } catch {
    return res.json({ success: false, error: "Invalid URL" });
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
  } catch (err) {
    return res.json({
      success: false,
      error: err instanceof Error ? err.message : "Connection failed",
    });
  }
}
