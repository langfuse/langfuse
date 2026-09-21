export function resolveRoutePathname({
  pathname,
  legacyPathname,
  v4Enabled,
  forceV3Experience,
}: {
  pathname: string;
  legacyPathname?: string;
  v4Enabled: boolean;
  forceV3Experience: boolean;
}): string {
  return legacyPathname && (!v4Enabled || forceV3Experience)
    ? legacyPathname
    : pathname;
}
