import { VERSION } from "../constants/VERSION";

const APPLICATION_NAME = `langfuse/${VERSION.replace("v", "")}`;

/**
 * Adds `application_name=langfuse/<version>` to a Postgres connection URL so
 * Langfuse sessions are identifiable in `pg_stat_activity`, server logs, and
 * managed Postgres query insights. An `application_name` already present in
 * the URL is left untouched.
 */
export const withPostgresApplicationName = (
  url: string | undefined,
): string | undefined => {
  if (!url || /[?&]application_name=/.test(url)) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}application_name=${encodeURIComponent(APPLICATION_NAME)}`;
};
