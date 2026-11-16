export function resolveRoutePathname({
  pathname,
  legacyPathname,
  v4Enabled,
}: {
  pathname: string;
  legacyPathname?: string;
  v4Enabled: boolean;
}): string {
  return legacyPathname && !v4Enabled ? legacyPathname : pathname;
}
