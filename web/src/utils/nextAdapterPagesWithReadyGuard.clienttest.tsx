import type { Mock } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useRouter } from "next/router";
import type { QueryParamAdapter } from "use-query-params";

import { NextAdapterPagesWithReadyGuard } from "@/src/utils/nextAdapterPagesWithReadyGuard";

vi.mock("next/router", () => ({
  useRouter: vi.fn(),
}));

afterEach(cleanup);

const ROUTE_PATTERN = "/project/[projectId]/prompts/[[...folder]]";

// Minimal router stand-in: before hydration of a statically-optimized dynamic
// route, `asPath` is still the raw pattern and `isReady` is false.
function makeRouter(isReady: boolean) {
  return {
    isReady,
    pathname: ROUTE_PATTERN,
    asPath: isReady ? "/project/p1/prompts" : ROUTE_PATTERN,
    push: vi.fn(),
    replace: vi.fn(),
  };
}

function renderGuardedAdapter(router: ReturnType<typeof makeRouter>) {
  (useRouter as Mock).mockReturnValue(router);
  let adapter: QueryParamAdapter | undefined;
  render(
    <NextAdapterPagesWithReadyGuard>
      {(a) => {
        adapter = a;
        return null;
      }}
    </NextAdapterPagesWithReadyGuard>,
  );
  if (!adapter) throw new Error("adapter was not provided to children");
  return adapter;
}

describe("NextAdapterPagesWithReadyGuard", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("drops replace issued before the router is ready and warns", () => {
    const router = makeRouter(false);
    const adapter = renderGuardedAdapter(router);

    adapter.replace({ search: "?filter=a" });

    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test("drops push issued before the router is ready and warns", () => {
    const router = makeRouter(false);
    const adapter = renderGuardedAdapter(router);

    adapter.push({ search: "?filter=a" });

    expect(router.push).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test("passes writes through unchanged once the router is ready", () => {
    const router = makeRouter(true);
    const adapter = renderGuardedAdapter(router);

    adapter.replace({ search: "?filter=a" });
    adapter.push({ search: "?page=2" });

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: ROUTE_PATTERN, search: "?filter=a" }),
      expect.anything(),
      expect.objectContaining({ shallow: true }),
    );
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("reads readiness at call time: a write after the isReady flip passes even without a re-render", () => {
    const router = makeRouter(false);
    const adapter = renderGuardedAdapter(router);

    // The pages router is a singleton mutated in place; flip readiness on the
    // same object without re-rendering.
    router.isReady = true;
    adapter.replace({ search: "?filter=a" });

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
