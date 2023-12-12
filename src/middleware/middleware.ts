// Middleware to block requests from certain IPs on Langfuse Cloud
// Not included in the self-host build, removed in Dockerfile

// import { type NextApiRequest } from "next";
// import { type NextRequest } from "next/server";
// import { get } from "@vercel/edge-config";

// export async function middleware(req: NextRequest) {
//   try {
//     if (process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined) {
//       const config = await get("blockedIps");
//       const blockedIps = Array.isArray(config) ? config : [config];

//       const ip = getIP(req);
//       if (ip && blockedIps.includes(ip)) {
//         console.log("Blocked request by ip: ", ip);
//         return new Response("Access denied", { status: 403 });
//       }
//     }

//     return;
//   } catch (e) {
//     console.error("Server side error in middleware: ", e);
//     return new Response("Internal server error", { status: 500 });
//   }
// }

// export default function getIP(request: Request | NextApiRequest) {
//   const xff =
//     request instanceof Request
//       ? request.headers.get("x-forwarded-for")
//       : request.headers["x-forwarded-for"];

//   return xff ? (Array.isArray(xff) ? xff[0] : xff.split(",")[0]) : "127.0.0.1";
// }
