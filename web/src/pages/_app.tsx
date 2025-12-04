import { type AppType } from "next/app";
import { type Session } from "next-auth";
import dynamic from "next/dynamic";
import { api } from "@/src/utils/api";

import "@/src/styles/globals.css";
import { AppLayout } from "@/src/components/layouts/app-layout";
import prexit from "prexit";
import { RootProvider } from "@/src/components/RootProvider";
const AnalyticsProvider = dynamic(
  () =>
    import("@/src/components/AnalyticsProvider").then((mod) => ({
      default: mod.AnalyticsProvider,
    })),
  { ssr: false },
);

// Custom polyfills not yet available in `next-core`:
// https://github.com/vercel/next.js/issues/58242
// https://nextjs.org/docs/architecture/supported-browsers#custom-polyfills
import "core-js/features/array/to-reversed";
import "core-js/features/array/to-spliced";
import "core-js/features/array/to-sorted";

import "react18-json-view/src/style.css";

// Polyfill to prevent React crashes when Google Translate modifies the DOM.
// Google Translate wraps text nodes in <font> elements, which breaks React's
// reconciliation when it tries to remove/insert nodes that no longer exist
// in the expected location. This catches NotFoundError and prevents crashes
// while still allowing translation to work.
// See: https://github.com/facebook/react/issues/11538
// See also: https://issues.chromium.org/issues/41407169
if (typeof window !== "undefined") {
  const originalRemoveChild = Element.prototype.removeChild;
  const originalInsertBefore = Element.prototype.insertBefore;

  Element.prototype.removeChild = function <T extends Node>(child: T): T {
    try {
      return originalRemoveChild.call(this, child) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        // Node was likely moved by Google Translate - silently ignore
        return child;
      }
      throw error;
    }
  };

  Element.prototype.insertBefore = function <T extends Node>(
    newNode: T,
    referenceNode: Node | null,
  ): T {
    try {
      return originalInsertBefore.call(this, newNode, referenceNode) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        // Reference node was likely moved by Google Translate
        // Fallback: append to end (DOM is already inconsistent anyway)
        return this.appendChild(newNode) as T;
      }
      throw error;
    }
  };
}

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <RootProvider session={session}>
      <AnalyticsProvider>
        <AppLayout>
          <Component {...pageProps} />
        </AppLayout>
      </AnalyticsProvider>
    </RootProvider>
  );
};

export default api.withTRPC(MyApp);

if (
  process.env.NEXT_RUNTIME === "nodejs" &&
  process.env.NEXT_MANUAL_SIG_HANDLE
) {
  const { shutdown } = await import("@/src/utils/shutdown");
  prexit(async (signal) => {
    console.log("Signal: ", signal);
    return await shutdown(signal);
  });
}
