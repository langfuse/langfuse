import { getAuthOptions } from "@/src/server/auth";
import type { NextApiRequest, NextApiResponse } from "next";
import NextAuth from "next-auth";

export default async function auth(req: NextApiRequest, res: NextApiResponse) {
  // Workaround for corporate email link checkers (e.g., Outlook SafeLink)
  // https://next-auth.js.org/tutorials/avoid-corporate-link-checking-email-provider
  if (req.method === "HEAD") {
    return res.status(200).end();
  }
  // Do whatever you want here, before the request is passed down to `NextAuth`
  const authOptions = await getAuthOptions();
  // https://github.com/nextauthjs/next-auth/issues/2408#issuecomment-1382629234
  // for api routes, we need to call the headers in the api route itself
  // disable caching for anything auth related
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return await NextAuth(req, res, authOptions);
}
