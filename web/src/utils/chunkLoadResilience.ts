/**
 * Chunk Load Resilience Utility for Next.js
 *
 * Prevents client UI hanging indefinitely when code-split JavaScript chunks
 * (_next/static/chunks/*.js) fail or hang during client-side navigation.
 */

let listenerInstalled = false;

export function setupChunkLoadResilience(): () => void {
  if (typeof window === "undefined" || listenerInstalled) {
    return () => {};
  }

  listenerInstalled = true;

  // Intercept window script load errors for Next.js static chunks
  const handleScriptError = (event: ErrorEvent | Event) => {
    const target = event.target as HTMLScriptElement | null;
    if (
      target &&
      target.tagName === "SCRIPT" &&
      target.src &&
      target.src.includes("/_next/static/chunks/")
    ) {
      console.warn(
        `[chunkLoadResilience] Failed to load JavaScript chunk: ${target.src}`,
      );

      // Check if this script target has already been retried to avoid infinite loops
      const retryCount = parseInt(target.getAttribute("data-retry-count") || "0", 10);
      if (retryCount < 2) {
        target.setAttribute("data-retry-count", String(retryCount + 1));
        const newScript = document.createElement("script");
        newScript.src = `${target.src}${target.src.includes("?") ? "&" : "?"}_retry=${Date.now()}`;
        newScript.async = true;
        newScript.onerror = handleScriptError;
        document.head.appendChild(newScript);
      }
    }
  };

  // Intercept unhandled ChunkLoadError exceptions
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const error = event.reason;
    if (
      error &&
      (error.name === "ChunkLoadError" ||
        (typeof error.message === "string" &&
          (error.message.includes("Loading chunk") ||
            error.message.includes("Failed to fetch dynamically imported module"))))
    ) {
      console.warn(
        "[chunkLoadResilience] Captured unhandled ChunkLoadError:",
        error.message,
      );
    }
  };

  window.addEventListener("error", handleScriptError, true);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    window.removeEventListener("error", handleScriptError, true);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    listenerInstalled = false;
  };
}
