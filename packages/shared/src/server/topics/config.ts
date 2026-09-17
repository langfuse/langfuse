import { env } from "../../env";

export function isTopicsEnabled(): boolean {
  if (env.NODE_ENV !== "development" || !env.NEXTAUTH_URL) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(env.NEXTAUTH_URL).hostname,
    );
  } catch {
    return false;
  }
}

