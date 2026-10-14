import { z } from "zod";

/**
 * Schema for a single entry of the instance switcher shown in the sidebar
 * user menu. Configured via LANGFUSE_UI_INSTANCE_LINKS.
 */
export const InstanceLink = z.object({
  name: z.string().min(1),
  // Restricted to http(s): the URL is handed to window.open, where a
  // javascript:/data:/file: entry would run in the app's context rather
  // than open another Langfuse deployment.
  url: z.url({ protocol: /^https?$/ }),
});

export type InstanceLink = z.infer<typeof InstanceLink>;

// Names must be unique: they are the only thing distinguishing entries in
// the menu, and the sidebar keys its items by name.
const InstanceLinks = z
  .array(InstanceLink)
  .min(1)
  .refine((links) => new Set(links.map((l) => l.name)).size === links.length, {
    message: "Instance link names must be unique",
  });

/**
 * Parse LANGFUSE_UI_INSTANCE_LINKS into the instance links rendered as an
 * instance switcher in the sidebar user menu.
 *
 * Expects a JSON array of { name, url } objects with unique names and
 * http(s) URLs, e.g.
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

  const result = InstanceLinks.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    console.warn(
      `LANGFUSE_UI_INSTANCE_LINKS is invalid, so the instance switcher is disabled. Expected a non-empty JSON array of {name, url} objects with unique names and http(s) URLs. ${issues}`,
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
