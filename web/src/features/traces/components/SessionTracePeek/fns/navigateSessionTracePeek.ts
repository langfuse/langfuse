import { type NextRouter } from "next/router";
import { urlSearchParamsToQuery } from "@/src/utils/navigation";

export function navigateSessionTracePeek({
  router,
  method,
  host,
  args: [url, as, options],
}: {
  router: Pick<
    NextRouter,
    "pathname" | "asPath" | "query" | "push" | "replace"
  >;
  method: "push" | "replace";
  host: string;
  args: Parameters<NextRouter["push"]>;
}) {
  const target =
    typeof url === "string" ? new URL(url, "http://peek.local") : url;
  const isExternal =
    target.host && target.host !== "peek.local" && target.host !== host;
  if (
    isExternal ||
    (target.pathname &&
      target.pathname !== router.pathname &&
      target.pathname !== router.asPath.split("?")[0])
  ) {
    return router[method](url, as, options);
  }
  const query =
    typeof url === "string"
      ? urlSearchParamsToQuery(new URLSearchParams(target.search ?? ""))
      : (url.query ??
        urlSearchParamsToQuery(new URLSearchParams(url.search ?? "")));
  const next = new URLSearchParams();
  if (typeof query === "string") {
    new URLSearchParams(query).forEach((value, key) => next.append(key, value));
  } else {
    for (const [key, value] of Object.entries(query)) {
      if (key === "projectId" || key === "sessionId") continue;
      if (Array.isArray(value)) {
        for (const entry of value) next.append(key, String(entry));
      } else if (value !== undefined && value !== null) {
        next.set(key, String(value));
      }
    }
  }
  return router[method](
    {
      pathname: router.pathname,
      query: { ...router.query, sessionPeek: next.toString() },
    },
    undefined,
    { ...options, shallow: true },
  );
}
