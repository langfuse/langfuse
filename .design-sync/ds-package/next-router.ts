// tsconfig `paths` maps every `next/router` import here - in the bundle and in
// each preview IIFE, which bundles its own copy of non-DS code like
// web/src/components/table. useRouter reads the one RouterContext that
// LangfuseProvider publishes, so its stub router reaches those copies too.
import { useContext } from "react";
import { type NextRouter } from "next/dist/client/router";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";

export * from "next/dist/client/router";
export { default } from "next/dist/client/router";

/** useRouter returns the router mounted by the nearest shared RouterContext */
export function useRouter(): NextRouter {
  const router = useContext(sharedRouterContext());
  if (!router) throw new Error("NextRouter was not mounted.");
  return router;
}

/** sharedRouterContext returns the published bundle RouterContext, else this copy's own */
function sharedRouterContext(): typeof RouterContext {
  const published = (globalThis as SharedRouterGlobal).__dsRouterContext;
  if (published) return published;
  return RouterContext;
}

type SharedRouterGlobal = { __dsRouterContext?: typeof RouterContext };
