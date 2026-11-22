import { env } from "../../../env";

/** buildPermalink composes the absolute Langfuse URL for a monitor, or undefined when NEXTAUTH_URL is unset. */
export function buildPermalink(
  projectId: string,
  monitorId: string,
): string | undefined {
  if (!env.NEXTAUTH_URL) return undefined;
  const base = env.NEXTAUTH_URL.replace(/\/$/, "");
  return `${base}/project/${projectId}/alerts/${monitorId}`;
}
