import { useRouter } from "next/router";
import Spinner from "@/src/components/design-system/Spinner/Spinner";

/**
 * Next.js pages-router dynamic segments are missing on the first render of a
 * statically-optimized route (`router.query` is `{}` until hydration). Casts
 * like `router.query.traceId as string` become `undefined` at runtime, so
 * tRPC queries fire with invalid input (400 + "Bad Request" toast) before
 * the page recovers.
 *
 * Wait until every requested param is an actual non-empty string, then mount
 * the data-fetching child.
 */
export function asSingleQueryParam(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function useReadyRouteParams<const K extends string>(
  keys: readonly K[],
): { ready: false } | { ready: true; params: { [P in K]: string } } {
  const router = useRouter();
  const params = {} as { [P in K]: string };

  for (const key of keys) {
    const value = asSingleQueryParam(router.query[key]);
    if (value === undefined) {
      return { ready: false };
    }
    params[key] = value;
  }

  return { ready: true, params };
}

export function RouteParamsPendingFallback() {
  return <Spinner size="xl" variant="muted" />;
}
