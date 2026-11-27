import { useRef, useState, type ReactNode } from "react";
import { useRouter, type NextRouter } from "next/router";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import {
  QueryParamProvider,
  type QueryParamAdapterComponent,
} from "use-query-params";
import { urlSearchParamsToQuery } from "@/src/utils/navigation";

const EmbedQueryAdapter: QueryParamAdapterComponent = ({ children }) => {
  const router = useRouter();
  return children({
    location: {
      search: new URL(router.asPath, "http://notebook.local").search,
    },
    push: ({ search }) => {
      void router.push({ pathname: router.pathname, search });
    },
    replace: ({ search }) => {
      void router.replace({ pathname: router.pathname, search });
    },
  });
};

export function NotebookEmbedNavigation({
  children,
  initialObservationId,
}: {
  children: ReactNode;
  initialObservationId?: string;
}) {
  const router = useRouter();
  // Keep workspace tabs and selections out of the notebook URL and other embeds.
  const [search, setSearch] = useState(() =>
    initialObservationId
      ? new URLSearchParams({ observation: initialObservationId }).toString()
      : "",
  );
  const currentSearch = useRef(search);
  const path = router.asPath.split("?")[0];
  const navigate =
    (method: "push" | "replace"): NextRouter["push"] =>
    (url, as, options) => {
      const destination =
        typeof url === "string"
          ? new URL(url, `http://notebook.local${path}`)
          : undefined;
      const pathname =
        typeof url === "string" ? destination?.pathname : url.pathname;
      if (destination && destination.origin !== "http://notebook.local")
        return router[method](url, as, options);
      if (pathname && pathname !== router.pathname && pathname !== path)
        return router[method](url, as, options);

      const params = new URLSearchParams(
        typeof url === "string" ? destination?.search : (url.search ?? ""),
      );
      if (
        typeof url !== "string" &&
        url.query &&
        typeof url.query !== "string"
      ) {
        for (const [key, value] of Object.entries(url.query)) {
          params.delete(key);
          for (const item of Array.isArray(value) ? value : [value]) {
            if (item != null) params.append(key, String(item));
          }
        }
      }
      const next = params.toString();
      if (currentSearch.current !== next) {
        currentSearch.current = next;
        setSearch(next);
      }
      return Promise.resolve(true);
    };

  return (
    <RouterContext.Provider
      value={{
        ...router,
        asPath: `${path}${search ? `?${search}` : ""}`,
        query: {
          projectId: router.query.projectId,
          ...urlSearchParamsToQuery(new URLSearchParams(search)),
        },
        push: navigate("push"),
        replace: navigate("replace"),
      }}
    >
      <QueryParamProvider adapter={EmbedQueryAdapter}>
        {children}
      </QueryParamProvider>
    </RouterContext.Provider>
  );
}
