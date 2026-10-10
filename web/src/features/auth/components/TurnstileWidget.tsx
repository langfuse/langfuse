import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react";
import type { TurnstileAction } from "@/src/features/auth/constants";

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileRenderOptions = {
  sitekey: string;
  action: string;
  theme?: "auto" | "light" | "dark";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Turnstile script loaded without its API"));
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error("Failed to load the Turnstile script"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

type PendingToken = ((token: string | undefined) => void) | null;

function settlePending(
  pending: { current: PendingToken },
  token: string | undefined,
) {
  pending.current?.(token);
  pending.current = null;
}

export type TurnstileWidgetHandle = {
  /** Discards the current token (tokens are single-use) and re-runs the challenge. */
  reset: () => void;
  /**
   * Resolves with the next token the widget issues, including after the
   * widget re-renders for a new `action`. Resolves `undefined` if the
   * challenge fails or another caller starts waiting first.
   */
  nextToken: () => Promise<string | undefined>;
};

/**
 * Cloudflare Turnstile widget, rendered explicitly so it can be reset after
 * every submit on pages that stay mounted. Changing `action` re-renders the
 * widget so the next token carries the new action. `onTokenChange` receives
 * `undefined` whenever the current token is no longer usable.
 */
export function TurnstileWidget({
  siteKey,
  action,
  onTokenChange,
  ref,
}: {
  siteKey: string;
  action: TurnstileAction;
  onTokenChange: (token: string | undefined) => void;
  ref?: Ref<TurnstileWidgetHandle>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const pendingTokenRef = useRef<PendingToken>(null);

  const handleToken = useEffectEvent((token: string | undefined) => {
    onTokenChange(token);
    if (token) settlePending(pendingTokenRef, token);
  });

  const handleError = useEffectEvent(() => {
    onTokenChange(undefined);
    settlePending(pendingTokenRef, undefined);
  });

  // Turnstile is an imperative third-party widget: render it into the
  // container on mount and remove it on unmount.
  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: "auto",
          callback: (token) => handleToken(token),
          "expired-callback": () => handleToken(undefined),
          "error-callback": () => handleError(),
        });
      })
      .catch(() => handleError());

    return () => {
      cancelled = true;
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action]);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        onTokenChange(undefined);
        if (widgetIdRef.current) {
          window.turnstile?.reset(widgetIdRef.current);
        }
      },
      nextToken: () => {
        settlePending(pendingTokenRef, undefined);
        return new Promise<string | undefined>((resolve) => {
          pendingTokenRef.current = resolve;
        });
      },
    }),
    [onTokenChange],
  );

  return <div ref={containerRef} className="flex justify-center" />;
}
