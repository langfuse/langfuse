export const MANUAL_WIDGET_ERROR_SEARCH_PARAM = "lf_force_widget_error";
export const MANUAL_WIDGET_ERROR_MESSAGE =
  "Manually triggered widget error for local testing.";

const TRUTHY_PARAM_VALUES = new Set(["1", "true"]);

export function shouldForceManualWidgetError({
  referer,
  nodeEnv = process.env.NODE_ENV,
}: {
  referer?: string | string[];
  nodeEnv?: string;
}) {
  if (nodeEnv === "production") {
    return false;
  }

  const rawReferer = Array.isArray(referer) ? referer[0] : referer;
  if (!rawReferer) {
    return false;
  }

  try {
    const url = new URL(rawReferer);
    const value = url.searchParams.get(MANUAL_WIDGET_ERROR_SEARCH_PARAM);

    return value !== null && TRUTHY_PARAM_VALUES.has(value.toLowerCase());
  } catch {
    return false;
  }
}
