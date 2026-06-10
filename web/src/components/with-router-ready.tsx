import { useRouter } from "next/router";

/**
 * Gates a dynamic-route page until Next's router has populated router.query.
 *
 * On direct/deep-link loads, router.query is empty during the first render
 * (pages router hydration), so `router.query.x as string` is undefined and
 * any tRPC query fired from the page or its children 400s and surfaces an
 * error toast. Wrapping the page defers ALL of its hooks until params exist.
 *
 *   export default withRouterReady(MyPage);
 */
export function withRouterReady<P extends object>(
  Component: React.ComponentType<P>,
): React.ComponentType<P> {
  function RouterReadyGate(props: P) {
    const router = useRouter();
    if (!router.isReady) return null;
    return <Component {...props} />;
  }
  RouterReadyGate.displayName = `withRouterReady(${Component.displayName ?? Component.name ?? "Page"})`;
  return RouterReadyGate;
}
