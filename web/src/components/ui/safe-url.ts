const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

const getSafeUrl = (
  value: string | undefined | null,
  {
    allowedProtocols,
    allowHash = false,
    allowAbsolutePath = true,
  }: {
    allowedProtocols: Set<string>;
    allowHash?: boolean;
    allowAbsolutePath?: boolean;
  },
): string | null => {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return allowedProtocols.has(parsed.protocol) ? trimmed : null;
  } catch {
    if (allowHash && trimmed.startsWith("#")) {
      return trimmed;
    }

    if (
      allowAbsolutePath &&
      trimmed.startsWith("/") &&
      !trimmed.startsWith("//")
    ) {
      return trimmed;
    }

    return null;
  }
};

export const getSafeLinkUrl = (
  value: string | undefined | null,
): string | null =>
  getSafeUrl(value, {
    allowedProtocols: SAFE_LINK_PROTOCOLS,
    allowHash: true,
  });

export const getSafeImageUrl = (
  value: string | undefined | null,
): string | null =>
  getSafeUrl(value, {
    allowedProtocols: SAFE_IMAGE_PROTOCOLS,
  });
