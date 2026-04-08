import { env } from "@/src/env.mjs";

export function getAppBaseUrl(hostnameOverride?: string | null): string {
  const origin =
    hostnameOverride ??
    (typeof window !== "undefined"
      ? window.location.origin
      : (env.NEXTAUTH_URL?.replace("/api/auth", "") ??
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : `http://localhost:${process.env.PORT ?? 3000}`)));

  return `${origin}${env.NEXT_PUBLIC_BASE_PATH ?? ""}`;
}
