import { createContext, useContext, type ReactNode } from "react";
import { useRouter, type NextRouter } from "next/router";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import {
  QueryParamProvider,
  type QueryParamAdapterComponent,
} from "use-query-params";
import { urlSearchParamsToQuery } from "@/src/utils/navigation";

const SessionTracePeekContext = createContext(false);
export const useIsSessionTracePeek = () => useContext(SessionTracePeekContext);

const SessionPeekQueryAdapter: QueryParamAdapterComponent = ({ children }) => {
  const router = useRouter();
  return children({
    location: { search: new URL(router.asPath, "http://peek.local").search },
    push: (location) => {
      router.push(
        { pathname: router.pathname, search: location.search },
        undefined,
        { shallow: true, scroll: false },
      );
    },
    replace: (location) => {
      router.replace(
        { pathname: router.pathname, search: location.search },
        undefined,
        { shallow: true, scroll: false },
      );
    },
  });
};

/**
 * Compatibility boundary for detail components using NextRouter or query params.
 * Same-page query navigation is stored in `sessionPeek`; navigation to another
 * page is delegated unchanged. The outer session URL state stays untouched.
 */
export function SessionTracePeekNavigationProvider({
  projectId,
  search,
  children,
}: {
  projectId: string;
  search: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const navigate = (
    method: "push" | "replace",
    ...[url, as, options]: Parameters<NextRouter["push"]>
  ) => {
    const target =
      typeof url === "string" ? new URL(url, "http://peek.local") : url;
    const isExternal =
      target.host &&
      target.host !== "peek.local" &&
      target.host !== window.location.host;
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
      new URLSearchParams(query).forEach((value, key) =>
        next.append(key, value),
      );
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
  };

  const scopedRouter: NextRouter = {
    ...router,
    query: {
      projectId,
      ...urlSearchParamsToQuery(new URLSearchParams(search)),
    },
    asPath: `${router.asPath.split("?")[0]}?${search}`,
    push: (...args) => navigate("push", ...args),
    replace: (...args) => navigate("replace", ...args),
  };

  return (
    <SessionTracePeekContext.Provider value={true}>
      <RouterContext.Provider value={scopedRouter}>
        <QueryParamProvider adapter={SessionPeekQueryAdapter}>
          {children}
        </QueryParamProvider>
      </RouterContext.Provider>
    </SessionTracePeekContext.Provider>
  );
}
