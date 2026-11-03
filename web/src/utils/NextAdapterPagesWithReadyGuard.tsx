import NextAdapterPages from "next-query-params/pages";
import { useRouter } from "next/router";
import type {
  PartialLocation,
  QueryParamAdapterComponent,
} from "use-query-params";

/**
 * Wraps the next-query-params pages adapter to drop query-param writes issued
 * before `router.isReady` (Sentry LANGFUSE-5V5 / LANGFUSE-5EM).
 *
 * Before hydration of a statically-optimized dynamic route, `router.asPath`
 * is still the raw pattern (e.g. `/project/[projectId]/prompts/[[...folder]]`)
 * and the query is empty, so a write makes `router.replace`/`push` throw
 * "The provided `href` ... is missing query values" as an unhandled rejection.
 *
 * Dropping (rather than deferring) is deliberate: a pre-ready write computes
 * its new search string against the adapter's pre-ready location, which is
 * `{ search: "" }` — replaying it after hydration would clobber real URL
 * params from deep links. Today such writes never land anyway (the router
 * throws before navigating), so dropping preserves behavior minus the error.
 * Reads are untouched: the adapter's `location` already handles pre-ready
 * state, and post-ready writes pass through unchanged.
 */
export const NextAdapterPagesWithReadyGuard: QueryParamAdapterComponent = ({
  children,
}) => {
  const router = useRouter();

  const guardWrite =
    (method: "push" | "replace", write: (location: PartialLocation) => void) =>
    (location: PartialLocation) => {
      // Read `isReady` at call time, not render time: the pages router is a
      // singleton mutated in place, so a write issued between the readiness
      // flip and the next render is not incorrectly dropped.
      if (!router.isReady) {
        console.warn(
          "[use-query-params] Dropped query param write issued before the Next.js router was ready (dynamic route params are not hydrated yet):",
          method,
          location.search,
        );
        return;
      }
      write(location);
    };

  return (
    <NextAdapterPages>
      {(adapter) =>
        children({
          ...adapter,
          push: guardWrite("push", adapter.push),
          replace: guardWrite("replace", adapter.replace),
        })
      }
    </NextAdapterPages>
  );
};
