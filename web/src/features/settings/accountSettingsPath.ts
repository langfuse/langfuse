/**
 * The settings page opened from the profile menu. Passing the current
 * organization keeps its settings in the same nav.
 */
export const accountSettingsPath = (organizationId?: string) =>
  organizationId
    ? `/account/settings?organizationId=${encodeURIComponent(organizationId)}`
    : "/account/settings";
