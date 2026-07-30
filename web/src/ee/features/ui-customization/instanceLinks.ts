import { z } from "zod";

/**
 * Schema for a single entry of the instance switcher shown in the sidebar
 * user menu. Configured via LANGFUSE_UI_INSTANCE_LINKS.
 */
export const InstanceLink = z.object({
  name: z.string().min(1),
  url: z.url(),
});

export type InstanceLink = z.infer<typeof InstanceLink>;

/**
 * Parse LANGFUSE_UI_INSTANCE_LINKS into the instance links rendered as an
 * instance switcher in the sidebar user menu.
 *
 * Expects a JSON array of { name, url } objects, e.g.
 * [{"name":"Staging","url":"https://langfuse-staging.example.com"}]
 *
 * Invalid configuration disables the switcher (returns null) instead of
 * failing the deployment.
 */
export function parseInstanceLinks(raw?: string): InstanceLink[] | null {
  if (!raw || !raw.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(
      "LANGFUSE_UI_INSTANCE_LINKS is not valid JSON. Expected a JSON array of {name, url} objects. The instance switcher is disabled.",
    );
    return null;
  }

  const result = z.array(InstanceLink).min(1).safeParse(parsed);
  if (!result.success) {
    console.warn(
      "LANGFUSE_UI_INSTANCE_LINKS is invalid. Expected a non-empty JSON array of {name, url} objects with valid URLs. The instance switcher is disabled.",
    );
    return null;
  }

  return result.data;
}

/**
 * Find the configured instance link matching the host (hostname + port) the
 * user is currently on, if any.
 */
export function findCurrentInstance(
  links: InstanceLink[],
  currentHost: string | undefined,
): InstanceLink | undefined {
  if (!currentHost) return undefined;

  return links.find((link) => {
    try {
      return new URL(link.url).host === currentHost;
    } catch {
      return false;
    }
  });
}
