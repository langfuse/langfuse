import { type NextApiRequest } from "next";
import { type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_HOSTNAME === "cloud.langfuse.com") {
    const ip = getIP(req);
    if (ip && blockedIps.includes(ip)) {
      console.log("Blocked request by ip: ", ip);
      return new Response("Access denied", { status: 403 });
    }
  }

  return;
}

export default function getIP(request: Request | NextApiRequest) {
  const xff =
    request instanceof Request
      ? request.headers.get("x-forwarded-for")
      : request.headers["x-forwarded-for"];

  return xff ? (Array.isArray(xff) ? xff[0] : xff.split(",")[0]) : "127.0.0.1";
}

const blockedIps = ["49.207.204.122"];
